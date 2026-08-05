import { CustomerSegment, CustomerType, ModuleKey, PriceTier, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function ensureTenantAndAdmin() {
  const slug = 'demo';
  let tenant = await prisma.tenant.findUnique({ where: { slug } });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: 'Distribuidora Demo', slug, status: 'ACTIVE', plan: 'trial' },
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
  retailPrice: number;
  wholesalePrice: number;
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
    retailPrice: 320,
    wholesalePrice: 260,
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
    retailPrice: 360,
    wholesalePrice: 300,
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
    retailPrice: 90,
    wholesalePrice: 70,
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
    retailPrice: 420,
    wholesalePrice: 350,
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
    retailPrice: 340,
    wholesalePrice: 280,
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
        retailPrice: seedProduct.retailPrice,
        wholesalePrice: seedProduct.wholesalePrice,
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
      priceTier: PriceTier.RETAIL,
    },
    {
      type: CustomerType.COMPANY,
      name: 'Auto Peças Center Ltda',
      document: '11222333000181',
      email: 'compras@autopecascenter.example.com',
      phone: '1133334444',
      segment: CustomerSegment.RECURRING,
      priceTier: PriceTier.WHOLESALE,
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

// Fase 7: planos padrão do SaaS. "trial" cobre só o ERP básico; "pro" soma
// e-commerce/logística/fiscal; "premium" libera tudo (inclusive WhatsApp e BI).
const PLAN_DEFS: { key: string; name: string; priceMonthly: number; modules: ModuleKey[] }[] = [
  {
    key: 'trial',
    name: 'Trial',
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
      ModuleKey.ECOMMERCE,
      ModuleKey.LOGISTICS,
      ModuleKey.FISCAL,
    ],
  },
  {
    key: 'premium',
    name: 'Premium',
    priceMonthly: 399,
    modules: Object.values(ModuleKey),
  },
];

async function ensurePlans() {
  for (const def of PLAN_DEFS) {
    const existing = await prisma.plan.findUnique({ where: { key: def.key } });
    if (!existing) {
      await prisma.plan.create({ data: def });
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
