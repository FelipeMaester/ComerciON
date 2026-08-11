import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AutomationAction,
  AutomationEntityType,
  AutomationRule,
  AutomationTrigger,
  OpportunityStatus,
  Prisma,
  QuoteStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { TasksService } from '../tasks/tasks.service';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from '../whatsapp/whatsapp-provider.interface';

export type AutomationEventName = 'SALE_CONFIRMED' | 'OPPORTUNITY_WON' | 'OPPORTUNITY_LOST';

const EVENT_TRIGGER_MAP: Record<AutomationEventName, AutomationTrigger> = {
  SALE_CONFIRMED: AutomationTrigger.SALE_CONFIRMED,
  OPPORTUNITY_WON: AutomationTrigger.OPPORTUNITY_WON,
  OPPORTUNITY_LOST: AutomationTrigger.OPPORTUNITY_LOST,
};

interface ResolvedCustomer {
  id: string;
  name: string;
  phone: string | null;
}

/**
 * Motor de execução das regras de automação. Catálogo fixo de gatilhos/ações
 * (ver AutomationRulesService) — aqui só interpreta e executa, nunca inventa
 * um novo tipo de gatilho/ação em tempo de execução.
 */
@Injectable()
export class AutomationEngineService {
  private readonly logger = new Logger('AutomationEngineService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly tasksService: TasksService,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppProvider,
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
  }

  async scanTimeBasedRules() {
    const rules = await this.prisma.automationRule.findMany({
      where: {
        isActive: true,
        trigger: { in: [AutomationTrigger.QUOTE_PENDING_DAYS, AutomationTrigger.OPPORTUNITY_STALE_DAYS] },
      },
    });

    for (const rule of rules) {
      // eslint-disable-next-line no-await-in-loop
      await this.scanRule(rule);
    }
  }

  private async scanRule(rule: AutomationRule) {
    const days = (rule.triggerConfig as unknown as { days?: number } | null)?.days ?? 0;
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Só reprocessa registros que essa regra ainda não disparou — a mesma
    // regra nunca dispara duas vezes pro mesmo registro.
    const alreadyFired = await this.prisma.automationRunLog.findMany({
      where: { ruleId: rule.id },
      select: { entityId: true },
    });
    const excludeIds = alreadyFired.map((r) => r.entityId);

    if (rule.trigger === AutomationTrigger.QUOTE_PENDING_DAYS) {
      const quotes = await this.prisma.quote.findMany({
        where: { status: QuoteStatus.PENDING, createdAt: { lt: threshold }, id: { notIn: excludeIds } },
        select: { id: true },
      });
      for (const quote of quotes) {
        // eslint-disable-next-line no-await-in-loop
        await this.runRule(rule, AutomationEntityType.QUOTE, quote.id);
      }
      return;
    }

    const opportunities = await this.prisma.opportunity.findMany({
      where: { status: OpportunityStatus.OPEN, stageChangedAt: { lt: threshold }, id: { notIn: excludeIds } },
      select: { id: true },
    });
    for (const opportunity of opportunities) {
      // eslint-disable-next-line no-await-in-loop
      await this.runRule(rule, AutomationEntityType.OPPORTUNITY, opportunity.id);
    }
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
      const text = config.messageTemplate.replace(/\{\{customerName\}\}/g, customer.name);
      await this.whatsapp.sendText(customer.phone, text);
      return;
    }

    if (rule.action === AutomationAction.CREATE_TASK) {
      const config = rule.actionConfig as unknown as { titleTemplate: string; assignToId: string };
      const title = config.titleTemplate.replace(/\{\{customerName\}\}/g, customer?.name ?? '');
      await this.tasksService.create(
        {
          title,
          customerId: customer?.id,
          opportunityId: entityType === AutomationEntityType.OPPORTUNITY ? entityId : undefined,
        },
        config.assignToId,
      );
    }
  }

  private async resolveCustomer(entityType: AutomationEntityType, entityId: string): Promise<ResolvedCustomer | null> {
    const select = { customer: { select: { id: true, name: true, phone: true } } };

    if (entityType === AutomationEntityType.QUOTE) {
      const quote = await this.prisma.quote.findUnique({ where: { id: entityId }, select });
      return quote?.customer ?? null;
    }
    if (entityType === AutomationEntityType.OPPORTUNITY) {
      const opportunity = await this.prisma.opportunity.findUnique({ where: { id: entityId }, select });
      return opportunity?.customer ?? null;
    }
    const sale = await this.prisma.sale.findUnique({ where: { id: entityId }, select });
    return sale?.customer ?? null;
  }
}
