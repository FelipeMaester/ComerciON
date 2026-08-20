import { ForbiddenException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantContextService } from '../common/tenant/tenant-context.service';

/**
 * Modelos cujas linhas pertencem a um tenant e devem ser filtradas/preenchidas
 * automaticamente. Toda tabela de domínio de negócio criada nas próximas fases
 * (Customer, Product, Sale, ...) deve ser adicionada aqui.
 *
 * QUATRO modelos ficam de fora, cada um por um motivo — e a lista está
 * repetida em FORA_DO_ESCOPO_AUTOMATICO, logo abaixo, porque um teste confere
 * as duas contra o schema. Sem esse teste, esquecer de acrescentar uma tabela
 * nova aqui seria um vazamento entre lojas que ninguém veria até acontecer.
 *
 *   AuditLog        — tenantId é opcional (há eventos de plataforma sem loja) e
 *                     o AuditService preenche explicitamente.
 *   Subscription    — o BillingService sempre passa o tenantId do token, e o
 *   SubscriptionInvoice  webhook do provedor de cobrança atualiza por id, fora
 *                     de qualquer requisição.
 *   WhatsappSession — o socket do WhatsApp vive fora do ciclo de requisição:
 *                     as credenciais são gravadas por um callback que dispara
 *                     minutos depois, quando não existe contexto de loja
 *                     nenhum. Todas as consultas passam o tenantId à mão.
 */
export const TENANT_SCOPED_MODELS = new Set([
  'User',
  'Customer',
  'CustomerAddress',
  'CustomerVehicle',
  'Supplier',
  'Category',
  'Warehouse',
  'Product',
  'StockItem',
  'StockMovement',
  'SupplierProduct',
  'Sale',
  'SaleItem',
  'SalePayment',
  'FinancialEntry',
  'Coupon',
  'Invoice',
  'InvoiceCorrection',
  'Conversation',
  'Message',
  'SalesGoal',
  'Quote',
  'QuoteItem',
  'ServiceOrder',
  'ServiceOrderItem',
  'ProductEquivalence',
  'StockCount',
  'StockCountItem',
  'PipelineStage',
  'Opportunity',
  'Task',
  'AutomationRule',
  'AutomationRunLog',
  'AutomationSuggestion',
  'AutomationAnalysis',
  'CashSession',
  'CashMovement',
]);

/**
 * Modelos que TÊM tenantId e mesmo assim ficam fora do filtro automático.
 *
 * Existe para o teste distinguir "deliberadamente fora" de "esqueceram de
 * acrescentar" — que é como um vazamento entre lojas entra num sistema
 * multiempresa. Acrescentar um nome aqui é uma decisão consciente; deixar
 * de acrescentar em nenhuma das duas listas quebra o teste.
 */
export const FORA_DO_ESCOPO_AUTOMATICO = new Set([
  'AuditLog',
  'Subscription',
  'SubscriptionInvoice',
  'WhatsappSession',
]);

const WRITE_ACTIONS = new Set(['create', 'createMany']);
const WHERE_ACTIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly tenantContext: TenantContextService) {
    super();
  }

  async onModuleInit() {
    this.applyTenantScoping();
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private applyTenantScoping() {
    this.$use(async (params: Prisma.MiddlewareParams, next) => {
      const { model, action } = params;
      if (!model || !TENANT_SCOPED_MODELS.has(model)) {
        return next(params);
      }

      const tenantId = this.tenantContext.tenantId;

      if (WRITE_ACTIONS.has(action)) {
        // Contexto de tenant é o caminho normal, mas operações de bootstrap
        // (ex.: criar o primeiro usuário admin de um tenant recém-criado,
        // antes de existir sessão/contexto) podem fornecer tenantId explícito
        // no próprio payload — só bloqueamos se nenhum dos dois existir.
        params.args ??= {};
        if (Array.isArray(params.args.data)) {
          params.args.data = params.args.data.map((row: Record<string, unknown>) => {
            const rowTenantId = row.tenantId ?? tenantId;
            if (!rowTenantId) {
              throw new ForbiddenException(`Operação em ${model} exige contexto de tenant`);
            }
            return { ...row, tenantId: rowTenantId };
          });
        } else {
          const rowTenantId = params.args.data?.tenantId ?? tenantId;
          if (!rowTenantId) {
            throw new ForbiddenException(`Operação em ${model} exige contexto de tenant`);
          }
          params.args.data = { ...params.args.data, tenantId: rowTenantId };
        }
      } else if (action === 'upsert') {
        if (!tenantId) {
          throw new ForbiddenException(`Operação em ${model} exige contexto de tenant`);
        }
        params.args ??= {};
        params.args.where = { ...params.args.where, tenantId };
        params.args.create = { ...params.args.create, tenantId: params.args.create?.tenantId ?? tenantId };
      } else if (WHERE_ACTIONS.has(action) && tenantId) {
        params.args ??= {};
        params.args.where = { ...params.args.where, tenantId };
      }

      return next(params);
    });
  }

  /**
   * Escape hatch explícito para operações legítimas fora do escopo de um
   * tenant (jobs internos, futuro painel de super-admin). Uso deliberado
   * e raro — qualquer chamada aqui deve ser revisada com cuidado.
   */
  async runAsSystem<T>(callback: () => Promise<T>): Promise<T> {
    return this.tenantContext.run({}, callback);
  }
}
