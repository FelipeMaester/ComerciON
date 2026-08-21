import {
  AutomationAction,
  AutomationTrigger,
  CustomerSegment,
  CustomerType,
  ModuleKey,
  PipelineStage,
  PrismaClient,
  TaskStatus,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_PIPELINE_STAGES } from '../src/common/constants/pipeline-stages';

const prisma = new PrismaClient();

async function ensureTenantAndAdmin() {
  const slug = 'demo';
  let tenant = await prisma.tenant.findUnique({ where: { slug } });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: 'AutoPeças Demo', slug, status: 'ACTIVE', plan: 'trial' },
    });
    const passwordHash = await bcrypt.hash('Demo1234', 12);
    const admin = await prisma.user.create({
      data: { tenantId: tenant.id, name: 'Admin Demo', email: 'admin@demo.local', passwordHash, role: UserRole.ADMIN },
    });
    console.log(`Tenant "${slug}" criado. Login: ${admin.email} / senha: Demo1234`);
  } else {
    console.log(`Tenant "${slug}" já existe — reaproveitando.`);
  }

  return tenant;
}

async function ensureDefaultWarehouse(tenantId: string) {
  let warehouse = await prisma.warehouse.findFirst({ where: { tenantId, isDefault: true } });
  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: { tenantId, name: 'Loja Principal', isDefault: true },
    });
    console.log('Depósito padrão "Loja Principal" criado.');
  }
  return warehouse;
}

async function ensureCategory(tenantId: string, name: string) {
  const existing = await prisma.category.findFirst({ where: { tenantId, name } });
  if (existing) return existing;
  return prisma.category.create({ data: { tenantId, name } });
}

interface SeedProduct {
  sku: string;
  name: string;
  brand: string;
  vehicleApplication: string;
  categoryName: string;
  costPrice: number;
  price: number;
  minStock: number;
  initialStock: number;
}

const SEED_PRODUCTS: SeedProduct[] = [
  {
    sku: 'RAD-GOL-001',
    name: 'Radiador Gol G5/G6 1.0/1.6',
    brand: 'Valeo',
    vehicleApplication: 'VW Gol G5/G6 1.0/1.6 2008-2014',
    categoryName: 'Radiadores',
    costPrice: 180,
    price: 320,
    minStock: 5,
    initialStock: 12,
  },
  {
    sku: 'RAD-ONIX-001',
    name: 'Radiador Onix 1.0/1.4',
    brand: 'Denso',
    vehicleApplication: 'Chevrolet Onix 1.0/1.4 2012-2019',
    categoryName: 'Radiadores',
    costPrice: 210,
    price: 360,
    minStock: 5,
    initialStock: 8,
  },
  {
    sku: 'DEF-GOL-001',
    name: 'Defletor de Ar Gol G5/G6',
    brand: 'Original',
    vehicleApplication: 'VW Gol G5/G6',
    categoryName: 'Defletores',
    costPrice: 45,
    price: 90,
    minStock: 10,
    initialStock: 25,
  },
  {
    sku: 'COND-COROLLA-001',
    name: 'Condensador Corolla 1.8',
    brand: 'Valeo',
    vehicleApplication: 'Toyota Corolla 1.8 2009-2014',
    categoryName: 'Condensadores',
    costPrice: 250,
    price: 420,
    minStock: 3,
    // proposital: abaixo do minStock, para demonstrar o alerta de estoque baixo
    initialStock: 1,
  },
  {
    sku: 'VENT-CIVIC-001',
    name: 'Ventoinha Civic 1.8/2.0',
    brand: 'Denso',
    vehicleApplication: 'Honda Civic 1.8/2.0 2006-2011',
    categoryName: 'Ventoinhas',
    costPrice: 190,
    price: 340,
    minStock: 4,
    initialStock: 6,
  },
];

async function ensureProducts(tenantId: string, warehouseId: string) {
  for (const seedProduct of SEED_PRODUCTS) {
    const existing = await prisma.product.findFirst({ where: { tenantId, sku: seedProduct.sku } });
    if (existing) continue;

    const category = await ensureCategory(tenantId, seedProduct.categoryName);
    const product = await prisma.product.create({
      data: {
        tenantId,
        sku: seedProduct.sku,
        name: seedProduct.name,
        brand: seedProduct.brand,
        vehicleApplication: seedProduct.vehicleApplication,
        categoryId: category.id,
        costPrice: seedProduct.costPrice,
        price: seedProduct.price,
        minStock: seedProduct.minStock,
      },
    });

    await prisma.stockItem.create({
      data: { tenantId, productId: product.id, warehouseId, quantity: seedProduct.initialStock },
    });
    await prisma.stockMovement.create({
      data: {
        tenantId,
        productId: product.id,
        warehouseId,
        type: 'IN',
        quantity: seedProduct.initialStock,
        previousQuantity: 0,
        newQuantity: seedProduct.initialStock,
        reason: 'Estoque inicial (seed)',
      },
    });
  }
  console.log(`${SEED_PRODUCTS.length} produtos de exemplo garantidos (radiadores, defletores, condensadores, ventoinhas).`);
}

async function ensureCustomers(tenantId: string) {
  const customers = [
    {
      type: CustomerType.INDIVIDUAL,
      name: 'João Silva',
      document: '11144477735',
      email: 'joao.silva@example.com',
      phone: '11988887777',
      segment: CustomerSegment.NEW,
    },
    {
      type: CustomerType.COMPANY,
      name: 'Oficina Central Ltda',
      document: '11222333000181',
      email: 'compras@oficinacentral.example.com',
      phone: '1133334444',
      segment: CustomerSegment.RECURRING,
    },
  ];

  for (const data of customers) {
    const existing = await prisma.customer.findFirst({ where: { tenantId, document: data.document } });
    if (!existing) {
      await prisma.customer.create({ data: { tenantId, ...data } });
    }
  }
  console.log('Clientes de exemplo garantidos (1 pessoa física, 1 pessoa jurídica).');
}

async function ensurePipelineStages(tenantId: string): Promise<PipelineStage[]> {
  const existing = await prisma.pipelineStage.findMany({ where: { tenantId }, orderBy: { order: 'asc' } });
  if (existing.length > 0) return existing;

  await prisma.pipelineStage.createMany({
    data: DEFAULT_PIPELINE_STAGES.map((stage) => ({ tenantId, ...stage })),
  });
  console.log('Etapas padrão do funil de vendas garantidas (Novo Lead → ... → Ganho/Perdido).');
  return prisma.pipelineStage.findMany({ where: { tenantId }, orderBy: { order: 'asc' } });
}

async function ensureOpportunities(tenantId: string, stages: PipelineStage[]) {
  const customers = await prisma.customer.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  if (customers.length === 0) return;

  const stageByOrder = (order: number) => stages.find((s) => s.order === order)!;

  const demoOpportunities = [
    {
      title: 'Revisão completa do sistema de arrefecimento',
      estimatedValue: 850,
      stage: stageByOrder(2),
      source: 'WhatsApp',
      customer: customers[0],
    },
    {
      title: 'Troca de radiador em frota',
      estimatedValue: 3200,
      stage: stageByOrder(4),
      source: 'Indicação',
      customer: customers[1] ?? customers[0],
    },
    {
      title: 'Manutenção preventiva recorrente',
      estimatedValue: 420,
      stage: stageByOrder(5),
      source: 'Site',
      customer: customers[0],
    },
  ];

  for (const demo of demoOpportunities) {
    const existing = await prisma.opportunity.findFirst({ where: { tenantId, title: demo.title } });
    if (!existing) {
      await prisma.opportunity.create({
        data: {
          tenantId,
          customerId: demo.customer.id,
          stageId: demo.stage.id,
          title: demo.title,
          estimatedValue: demo.estimatedValue,
          source: demo.source,
        },
      });
    }
  }
  console.log('Oportunidades de exemplo garantidas (board do Pipeline não nasce vazio).');
}

async function ensureTasks(tenantId: string) {
  const admin = await prisma.user.findFirst({ where: { tenantId, role: UserRole.ADMIN }, orderBy: { createdAt: 'asc' } });
  if (!admin) return;

  const customers = await prisma.customer.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' }, take: 2 });
  const opportunity = await prisma.opportunity.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  const demoTasks: {
    title: string;
    dueDate: Date;
    customerId?: string;
    opportunityId?: string;
    status?: TaskStatus;
  }[] = [
    {
      title: 'Ligar para confirmar orçamento da revisão',
      dueDate: new Date(now.getTime() - 2 * day),
      customerId: customers[0]?.id,
      opportunityId: opportunity?.id,
    },
    {
      title: 'Enviar proposta de manutenção preventiva',
      dueDate: now,
      customerId: customers[1]?.id ?? customers[0]?.id,
    },
    {
      title: 'Follow-up pós-venda em 7 dias',
      dueDate: new Date(now.getTime() + 5 * day),
      customerId: customers[0]?.id,
    },
    {
      title: 'Retornar contato do lead do site',
      dueDate: new Date(now.getTime() - 5 * day),
      status: TaskStatus.DONE,
    },
  ];

  for (const demo of demoTasks) {
    const existing = await prisma.task.findFirst({ where: { tenantId, title: demo.title } });
    if (existing) continue;
    const status = demo.status ?? TaskStatus.PENDING;
    await prisma.task.create({
      data: {
        tenantId,
        title: demo.title,
        dueDate: demo.dueDate,
        assignedToId: admin.id,
        createdById: admin.id,
        customerId: demo.customerId,
        opportunityId: demo.opportunityId,
        status,
        completedAt: status === TaskStatus.DONE ? now : null,
      },
    });
  }
  console.log('Tarefas de exemplo garantidas (atrasada, hoje, futura e concluída).');
}

async function ensureAutomationRules(tenantId: string) {
  const admin = await prisma.user.findFirst({ where: { tenantId, role: UserRole.ADMIN }, orderBy: { createdAt: 'asc' } });
  if (!admin) return;

  // Desativadas por padrão — não queremos disparar WhatsApp/tarefas sem
  // querer assim que o tenant demo é criado. O usuário ativa quando quiser testar.
  const demoRules = [
    {
      name: 'Cobrar orçamento parado',
      trigger: AutomationTrigger.QUOTE_PENDING_DAYS,
      triggerConfig: { days: 3 },
      action: AutomationAction.SEND_WHATSAPP,
      actionConfig: { messageTemplate: 'Olá {{customerName}}, seu orçamento ainda está em aberto. Podemos ajudar a fechar?' },
    },
    {
      name: 'Follow-up pós-venda',
      trigger: AutomationTrigger.SALE_CONFIRMED,
      triggerConfig: undefined,
      action: AutomationAction.CREATE_TASK,
      actionConfig: { titleTemplate: 'Ligar para {{customerName}} sobre a venda recente', assignToId: admin.id },
    },
  ];

  for (const rule of demoRules) {
    const existing = await prisma.automationRule.findFirst({ where: { tenantId, name: rule.name } });
    if (existing) continue;
    await prisma.automationRule.create({
      data: {
        tenantId,
        name: rule.name,
        trigger: rule.trigger,
        triggerConfig: rule.triggerConfig,
        action: rule.action,
        actionConfig: rule.actionConfig,
        isActive: false,
      },
    });
  }
  console.log('Regras de automação de exemplo garantidas (desativadas por padrão).');
}

async function ensureSupplierWithLinks(tenantId: string) {
  const name = 'Distribuidora Valeo Brasil';
  let supplier = await prisma.supplier.findFirst({ where: { tenantId, name } });
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: { tenantId, name, email: 'vendas@valeobrasil.example.com', phone: '1122223333' },
    });
  }

  const linkedSkus = ['RAD-GOL-001', 'COND-COROLLA-001'];
  for (const sku of linkedSkus) {
    const product = await prisma.product.findFirst({ where: { tenantId, sku } });
    if (!product) continue;
    const existingLink = await prisma.supplierProduct.findUnique({
      where: { supplierId_productId: { supplierId: supplier.id, productId: product.id } },
    });
    if (!existingLink) {
      await prisma.supplierProduct.create({
        data: {
          tenantId,
          supplierId: supplier.id,
          productId: product.id,
          cost: Number(product.costPrice),
          isPreferred: true,
        },
      });
    }
  }
  console.log('Fornecedor de exemplo garantido, vinculado a 2 produtos.');
}

async function ensureCoupon(tenantId: string) {
  const code = 'BEMVINDO10';
  const existing = await prisma.coupon.findFirst({ where: { tenantId, code } });
  if (!existing) {
    await prisma.coupon.create({
      data: { tenantId, code, discountType: 'PERCENTAGE', value: 10, isActive: true },
    });
    console.log(`Cupom de exemplo "${code}" criado (10% de desconto).`);
  }
}

// Planos padrão do SaaS. "trial" cobre só o ERP básico; "pro" soma fiscal e
// automações; "premium" libera tudo (inclusive WhatsApp e BI).
//
// ECOMMERCE e LOGISTICS continuam no enum (remover valor de enum no Postgres
// custa caro) mas não gateiam mais nada: saíram junto com a loja virtual.
const PLAN_DEFS: { key: string; name: string; priceMonthly: number; modules: ModuleKey[] }[] = [
  {
    key: 'trial',
    // "Avaliação", não "Trial": o nome do plano aparece na tela de Planos e
    // dentro da mensagem que barra um módulo ("não está incluído no seu plano
    // atual"). Era a única palavra em inglês que chegava ao lojista por ali.
    // A chave continua 'trial' — ela é identificador, não texto de tela.
    name: 'Avaliação',
    priceMonthly: 0,
    modules: [ModuleKey.CRM, ModuleKey.INVENTORY, ModuleKey.SUPPLIERS, ModuleKey.SALES, ModuleKey.FINANCE],
  },
  {
    key: 'pro',
    name: 'Pro',
    priceMonthly: 199,
    modules: [
      ModuleKey.CRM,
      ModuleKey.INVENTORY,
      ModuleKey.SUPPLIERS,
      ModuleKey.SALES,
      ModuleKey.FINANCE,
      ModuleKey.FISCAL,
      ModuleKey.AUTOMATIONS,
    ],
  },
  {
    key: 'premium',
    name: 'Premium',
    priceMonthly: 399,
    // Tudo, menos AI: o chat com modelo de linguagem está desligado no
    // produto (cobra por uso e o valor que entregava — sugerir automações —
    // agora vem do motor de regras, de graça). O ModuleKey.AI continua
    // existindo para religar sem migration.
    modules: Object.values(ModuleKey).filter((m) => m !== ModuleKey.AI),
  },
];

/**
 * Em PRODUÇÃO quem cria os planos é a migration 20260813110000_planos_padrao —
 * o runbook de deploy não roda seed, e sem os planos toda loja nasceria sem
 * assinatura (e o ModulesGuard liberaria tudo). Esta função existe para o
 * desenvolvimento: ela também SINCRONIZA os módulos, o que a migration não
 * faz de propósito para não sobrescrever ajuste feito no banco de alguém.
 *
 * Mudou um plano? Mexa nos dois lugares.
 */
async function ensurePlans() {
  for (const def of PLAN_DEFS) {
    const existing = await prisma.plan.findUnique({ where: { key: def.key } });
    if (!existing) {
      await prisma.plan.create({ data: def });
    } else {
      // Sincroniza a lista de módulos com PLAN_DEFS mesmo em planos já
      // existentes — sem isso, um ModuleKey novo (ex.: AI) nunca chegaria
      // num plano seedado antes dele existir, mesmo rodando o seed de novo.
      await prisma.plan.update({ where: { key: def.key }, data: { modules: def.modules } });
    }
  }
  console.log('Planos padrão garantidos (trial, pro, premium).');
}

async function ensureSubscription(tenantId: string) {
  const existing = await prisma.subscription.findUnique({ where: { tenantId } });
  if (existing) return;

  const plan = await prisma.plan.findUniqueOrThrow({ where: { key: 'premium' } });
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

  const subscription = await prisma.subscription.create({
    data: { tenantId, planId: plan.id, status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: periodEnd },
  });
  await prisma.subscriptionInvoice.create({
    data: {
      subscriptionId: subscription.id,
      tenantId,
      amount: plan.priceMonthly,
      status: 'PAID',
      periodStart: now,
      periodEnd,
      paidAt: now,
      externalId: 'seed-invoice-1',
    },
  });
  console.log('Tenant demo assinado no plano Premium (simulado, todos os módulos liberados).');
}

async function ensureSuperAdmin(tenantId: string) {
  const email = 'superadmin@demo.local';
  const existing = await prisma.user.findFirst({ where: { tenantId, email } });
  if (existing) return;

  const passwordHash = await bcrypt.hash('SuperAdmin1234', 12);
  await prisma.user.create({
    data: { tenantId, name: 'Super Admin', email, passwordHash, role: UserRole.SUPER_ADMIN },
  });
  console.log(`Usuário super-admin criado. Login: ${email} / senha: SuperAdmin1234`);
}

async function main() {
  const tenant = await ensureTenantAndAdmin();
  const warehouse = await ensureDefaultWarehouse(tenant.id);
  await ensureProducts(tenant.id, warehouse.id);
  await ensureCustomers(tenant.id);
  const pipelineStages = await ensurePipelineStages(tenant.id);
  await ensureOpportunities(tenant.id, pipelineStages);
  await ensureTasks(tenant.id);
  await ensureAutomationRules(tenant.id);
  await ensureSupplierWithLinks(tenant.id);
  await ensureCoupon(tenant.id);
  await ensurePlans();
  await ensureSubscription(tenant.id);
  await ensureSuperAdmin(tenant.id);

  console.log('\nResumo para login (painel admin):');
  console.log('  header:  x-tenant-slug: demo');
  console.log('  login:   admin@demo.local');
  console.log('  senha:   Demo1234');
  console.log('  super-admin: superadmin@demo.local / SuperAdmin1234');
  console.log('\nCupom da loja: BEMVINDO10 (10% off)');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
