import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobLockService } from '../common/scheduling/job-lock.service';
import {
  AutomationAction,
  AutomationEntityType,
  AutomationRule,
  AutomationTrigger,
  FinancialEntryStatus,
  FinancialEntryType,
  OpportunityStatus,
  Prisma,
  QuoteStatus,
  SaleStatus,
  ServiceOrderStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { TasksService } from '../tasks/tasks.service';
import { WhatsappSenderService } from '../whatsapp/whatsapp-sender.service';
import { SCHEDULED_TRIGGERS, type ScheduledTrigger, entityTypeForTrigger } from './automation-catalog';

export type AutomationEventName = 'SALE_CONFIRMED' | 'OPPORTUNITY_WON' | 'OPPORTUNITY_LOST';

const EVENT_TRIGGER_MAP: Record<AutomationEventName, AutomationTrigger> = {
  SALE_CONFIRMED: AutomationTrigger.SALE_CONFIRMED,
  OPPORTUNITY_WON: AutomationTrigger.OPPORTUNITY_WON,
  OPPORTUNITY_LOST: AutomationTrigger.OPPORTUNITY_LOST,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Quantos registros uma única regra pode varrer por execução do cron. É um
 * freio de custo, não de performance: cada disparo de SEND_WHATSAPP é uma
 * conversa cobrada pela Meta. Sem teto, ativar "cliente sem comprar há 90
 * dias" numa base de 20 mil clientes dispararia 20 mil mensagens de uma vez,
 * com fatura de milhares de reais, na primeira madrugada. Com o teto, sobra
 * para o dia seguinte e o estrago é limitado e visível no log.
 */
const MAX_FIRES_PER_SCAN = 200;

interface ResolvedCustomer {
  id: string;
  name: string;
  phone: string | null;
}

/** Um scanner devolve os ids dos registros candidatos a disparo da regra. */
type Scanner = (days: number) => Promise<string[]>;

/**
 * Motor de execução das regras de automação. Catálogo fixo de gatilhos/ações
 * (ver automation-catalog.ts) — aqui só interpreta e executa, nunca inventa
 * um novo tipo de gatilho/ação em tempo de execução.
 */
@Injectable()
export class AutomationEngineService {
  private readonly logger = new Logger('AutomationEngineService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly tasksService: TasksService,
    private readonly whatsapp: WhatsappSenderService,
    private readonly jobLock: JobLockService,
  ) {}

  /**
   * Chamado pelos services de negócio (Sales/Opportunities) depois que a
   * transação de negócio já foi commitada — uma falha aqui nunca deve
   * desfazer ou impedir a operação original, só é logada.
   */
  async fireEvent(event: AutomationEventName, entityType: AutomationEntityType, entityId: string) {
    const rules = await this.prisma.automationRule.findMany({
      where: { trigger: EVENT_TRIGGER_MAP[event], isActive: true },
    });
    for (const rule of rules) {
      // eslint-disable-next-line no-await-in-loop
      await this.runRule(rule, entityType, entityId);
    }
  }

  /**
   * Jobs agendados rodam fora do ciclo de requisição HTTP — sem contexto de
   * tenant automático. Mesmo padrão de AutomationsService.runDailyAutomations
   * (apps/api/src/whatsapp/automations.service.ts): itera todos os tenants e
   * entra manualmente no contexto de cada um.
   */
  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async runTimeBasedRules() {
    // Sob lock: com duas instâncias da API no ar, as duas acordam às 10h e
    // disparariam as mesmas automações — WhatsApp em dobro para o cliente.
    await this.jobLock.runExclusively('automations:time-based-rules', async () => {
      const tenants = await this.prisma.runAsSystem(() => this.prisma.tenant.findMany({ select: { id: true } }));

      for (const tenant of tenants) {
        // eslint-disable-next-line no-await-in-loop
        await this.tenantContext.run({ tenantId: tenant.id }, async () => {
          try {
            await this.scanTimeBasedRules();
          } catch (error) {
            this.logger.error(`Falha ao rodar automações agendadas do tenant ${tenant.id}`, error as Error);
          }
        });
      }
    });
  }

  async scanTimeBasedRules() {
    const rules = await this.prisma.automationRule.findMany({
      where: { isActive: true, trigger: { in: SCHEDULED_TRIGGERS } },
    });

    for (const rule of rules) {
      // eslint-disable-next-line no-await-in-loop
      await this.scanRule(rule);
    }
  }

  /**
   * Tabela de varreduras — uma por gatilho agendado. Antes isto era um if/else
   * com dois ramos; virou tabela porque o catálogo agora tem seis gatilhos
   * agendados e o `satisfies` obriga a registrar o scanner de qualquer gatilho
   * novo em vez de deixá-lo sem efeito silenciosamente.
   */
  private scanners(): Record<ScheduledTrigger, Scanner> {
    const take = MAX_FIRES_PER_SCAN;

    return {
      [AutomationTrigger.QUOTE_PENDING_DAYS]: async (days) => {
        const rows = await this.prisma.quote.findMany({
          where: { status: QuoteStatus.PENDING, createdAt: { lt: this.ago(days) } },
          select: { id: true },
          take,
        });
        return rows.map((r) => r.id);
      },

      [AutomationTrigger.OPPORTUNITY_STALE_DAYS]: async (days) => {
        const rows = await this.prisma.opportunity.findMany({
          where: { status: OpportunityStatus.OPEN, stageChangedAt: { lt: this.ago(days) } },
          select: { id: true },
          take,
        });
        return rows.map((r) => r.id);
      },

      // "Sem comprar há X dias" pressupõe que já comprou alguma vez: quem
      // nunca comprou é lead, não cliente inativo, e entraria aqui em massa
      // poluindo a campanha de reativação. Por isso parte das vendas
      // confirmadas agrupadas por cliente, não da tabela de clientes.
      [AutomationTrigger.CUSTOMER_INACTIVE_DAYS]: async (days) => {
        const cutoff = this.ago(days);
        const lastPurchase = await this.prisma.sale.groupBy({
          by: ['customerId'],
          where: { status: SaleStatus.CONFIRMED, customerId: { not: null } },
          _max: { confirmedAt: true },
        });

        const inactiveIds = lastPurchase
          .filter((g) => {
            const last = g._max.confirmedAt;
            return last !== null && last < cutoff;
          })
          .map((g) => g.customerId as string);
        if (inactiveIds.length === 0) return [];

        const rows = await this.prisma.customer.findMany({
          where: { id: { in: inactiveIds }, isActive: true },
          select: { id: true },
          take,
        });
        return rows.map((r) => r.id);
      },

      // minStock = 0 significa "não controlo mínimo para este item" — sem
      // esse filtro, todo produto zerado no estoque dispararia.
      [AutomationTrigger.LOW_STOCK]: async () => {
        const products = await this.prisma.product.findMany({
          where: { isActive: true, minStock: { gt: 0 } },
          select: { id: true, minStock: true, stockItems: { select: { quantity: true } } },
          take: take * 5,
        });
        return products
          .filter((p) => p.stockItems.reduce((sum, s) => sum + s.quantity, 0) <= p.minStock)
          .slice(0, take)
          .map((p) => p.id);
      },

      [AutomationTrigger.RECEIVABLE_OVERDUE_DAYS]: async (days) => {
        const rows = await this.prisma.financialEntry.findMany({
          where: {
            type: FinancialEntryType.RECEIVABLE,
            status: { in: [FinancialEntryStatus.PENDING, FinancialEntryStatus.OVERDUE] },
            dueDate: { lt: this.ago(days) },
          },
          select: { id: true },
          take,
        });
        return rows.map((r) => r.id);
      },

      [AutomationTrigger.SERVICE_ORDER_STALE_DAYS]: async (days) => {
        const rows = await this.prisma.serviceOrder.findMany({
          where: {
            status: { in: [ServiceOrderStatus.OPEN, ServiceOrderStatus.IN_PROGRESS] },
            updatedAt: { lt: this.ago(days) },
          },
          select: { id: true },
          take,
        });
        return rows.map((r) => r.id);
      },
    };
  }

  private async scanRule(rule: AutomationRule) {
    const scanner = this.scanners()[rule.trigger as ScheduledTrigger];
    if (!scanner) return;

    const days = (rule.triggerConfig as unknown as { days?: number } | null)?.days ?? 0;
    const entityType = entityTypeForTrigger(rule.trigger);

    const candidates = await scanner(days);
    if (candidates.length === 0) return;

    const eligible = await this.filterByCooldown(rule, entityType, candidates);
    for (const entityId of eligible) {
      // eslint-disable-next-line no-await-in-loop
      await this.runRule(rule, entityType, entityId);
    }
  }

  /**
   * Descarta os registros que esta regra não pode disparar ainda.
   *
   * Antes: buscava TODOS os entityIds já disparados pela regra e montava um
   * `NOT IN` com a lista inteira — crescia sem limite e tornava impossível
   * reenviar (a regra nunca disparava duas vezes no mesmo registro).
   *
   * Agora a consulta parte dos candidatos (conjunto limitado por
   * MAX_FIRES_PER_SCAN) e pergunta quais deles têm disparo recente, usando o
   * índice [ruleId, entityType, entityId, firedAt]. Sem cooldown configurado,
   * qualquer disparo anterior bloqueia — o comportamento antigo, preservado
   * como padrão seguro.
   */
  private async filterByCooldown(
    rule: AutomationRule,
    entityType: AutomationEntityType,
    candidateIds: string[],
  ): Promise<string[]> {
    const firedAtFilter = rule.cooldownDays ? { firedAt: { gte: this.ago(rule.cooldownDays) } } : {};

    const blocking = await this.prisma.automationRunLog.findMany({
      where: { ruleId: rule.id, entityType, entityId: { in: candidateIds }, ...firedAtFilter },
      select: { entityId: true },
      distinct: ['entityId'],
    });

    const blocked = new Set(blocking.map((b) => b.entityId));
    return candidateIds.filter((id) => !blocked.has(id));
  }

  private ago(days: number): Date {
    return new Date(Date.now() - days * DAY_MS);
  }

  private async runRule(rule: AutomationRule, entityType: AutomationEntityType, entityId: string) {
    try {
      await this.executeAction(rule, entityType, entityId);
      await this.logRun(rule, entityType, entityId, true);
    } catch (error) {
      this.logger.error(`Falha ao executar a automação "${rule.name}" (${rule.id}) para ${entityType} ${entityId}`, error as Error);
      await this.logRun(rule, entityType, entityId, false, error).catch(() => undefined);
    }
  }

  private async logRun(rule: AutomationRule, entityType: AutomationEntityType, entityId: string, success: boolean, error?: unknown) {
    await this.prisma.automationRunLog.create({
      data: {
        tenantId: rule.tenantId,
        ruleId: rule.id,
        entityType,
        entityId,
        success,
        error: error instanceof Error ? error.message : error ? String(error) : undefined,
      } as Prisma.AutomationRunLogUncheckedCreateInput,
    });
  }

  private async executeAction(rule: AutomationRule, entityType: AutomationEntityType, entityId: string) {
    const customer = await this.resolveCustomer(entityType, entityId);

    if (rule.action === AutomationAction.SEND_WHATSAPP) {
      if (!customer?.phone) throw new Error('Cliente sem telefone cadastrado — não é possível enviar WhatsApp');
      const config = rule.actionConfig as unknown as { messageTemplate: string };
      const enviou = await this.whatsapp.enviarAutomatico({
        phone: customer.phone,
        text: this.fillTemplate(config.messageTemplate, customer),
        customerId: customer.id,
      });

      // Erro, e não sucesso silencioso: assim o motivo aparece no histórico
      // da regra em vez de a automação simplesmente parar de funcionar sem
      // que ninguém saiba por quê.
      if (!enviou) {
        throw new Error(`Teto de mensagens automáticas da loja atingido nas últimas 24h — mensagem não enviada`);
      }
      return;
    }

    if (rule.action === AutomationAction.CREATE_TASK) {
      const config = rule.actionConfig as unknown as { titleTemplate: string; assignToId: string };
      await this.tasksService.create(
        {
          title: this.fillTemplate(config.titleTemplate, customer),
          customerId: customer?.id,
          opportunityId: entityType === AutomationEntityType.OPPORTUNITY ? entityId : undefined,
        },
        config.assignToId,
      );
    }
  }

  private fillTemplate(template: string, customer: ResolvedCustomer | null): string {
    return template.replace(/\{\{customerName\}\}/g, customer?.name ?? '');
  }

  /**
   * Encontra o cliente por trás do registro que disparou a regra. PRODUCT não
   * tem cliente (estoque baixo é assunto interno) — o catálogo marca esses
   * gatilhos com hasCustomer: false e o cadastro impede combiná-los com uma
   * ação que fala com o cliente, então aqui devolver null basta.
   */
  private async resolveCustomer(entityType: AutomationEntityType, entityId: string): Promise<ResolvedCustomer | null> {
    const select = { customer: { select: { id: true, name: true, phone: true } } };

    switch (entityType) {
      case AutomationEntityType.QUOTE: {
        const quote = await this.prisma.quote.findUnique({ where: { id: entityId }, select });
        return quote?.customer ?? null;
      }
      case AutomationEntityType.OPPORTUNITY: {
        const opportunity = await this.prisma.opportunity.findUnique({ where: { id: entityId }, select });
        return opportunity?.customer ?? null;
      }
      case AutomationEntityType.SERVICE_ORDER: {
        const order = await this.prisma.serviceOrder.findUnique({ where: { id: entityId }, select });
        return order?.customer ?? null;
      }
      case AutomationEntityType.FINANCIAL_ENTRY: {
        const entry = await this.prisma.financialEntry.findUnique({ where: { id: entityId }, select });
        return entry?.customer ?? null;
      }
      case AutomationEntityType.CUSTOMER:
        return this.prisma.customer.findUnique({
          where: { id: entityId },
          select: { id: true, name: true, phone: true },
        });
      case AutomationEntityType.PRODUCT:
        return null;
      default: {
        const sale = await this.prisma.sale.findUnique({ where: { id: entityId }, select });
        return sale?.customer ?? null;
      }
    }
  }
}
