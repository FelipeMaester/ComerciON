import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, SubscriptionStatus, TenantStatus } from '@prisma/client';
import { JobLockService } from '../common/scheduling/job-lock.service';
import { PrismaService } from '../prisma/prisma.service';
import { BILLING_PROVIDER, BillingProvider } from './billing-provider.interface';

const SUBSCRIPTION_PERIOD_DAYS = 30;

/**
 * Assinatura e cobrança recorrente DOS TENANTS (o SaaS cobrando os
 * comerciantes que usam o sistema). Plan/Subscription/SubscriptionInvoice
 * não são tenant-scoped (ver comentário no schema.prisma) — são dados de
 * plataforma, por isso este serviço nunca depende do contexto de tenant da
 * requisição: o tenantId sempre chega como parâmetro explícito.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger('BillingService');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
    private readonly jobLock: JobLockService,
  ) {}

  async listPlans() {
    return this.prisma.plan.findMany({ orderBy: { priceMonthly: 'asc' } });
  }

  async getSubscription(tenantId: string) {
    return this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true, invoices: { orderBy: { createdAt: 'desc' } } },
    });
  }

  /** Contratação inicial ou troca de plano — cobra a primeira fatura na hora (exceto planos gratuitos). */
  async subscribe(tenantId: string, planKey: string) {
    const plan = await this.prisma.plan.findUnique({ where: { key: planKey } });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    const isFree = Number(plan.priceMonthly) === 0;
    const now = new Date();
    const periodEnd = addDays(now, SUBSCRIPTION_PERIOD_DAYS);

    const existing = await this.prisma.subscription.findUnique({ where: { tenantId } });
    const data = {
      planId: plan.id,
      status: isFree ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      canceledAt: null,
    };

    const subscription = existing
      ? await this.prisma.subscription.update({ where: { tenantId }, data })
      : await this.prisma.subscription.create({ data: { tenantId, ...data } as Prisma.SubscriptionUncheckedCreateInput });

    if (!isFree) {
      await this.chargeSubscription(subscription.id, tenantId, Number(plan.priceMonthly), now, periodEnd);
    }

    await this.prisma.tenant.update({ where: { id: tenantId }, data: { status: TenantStatus.ACTIVE } });

    return this.prisma.subscription.findUniqueOrThrow({ where: { tenantId }, include: { plan: true } });
  }

  private async chargeSubscription(subscriptionId: string, tenantId: string, amount: number, periodStart: Date, periodEnd: Date) {
    const result = await this.provider.charge({
      tenantId,
      amount,
      description: `Assinatura — período ${periodStart.toISOString().slice(0, 10)} a ${periodEnd.toISOString().slice(0, 10)}`,
    });

    await this.prisma.subscriptionInvoice.create({
      data: {
        subscriptionId,
        tenantId,
        amount,
        status: result.status,
        periodStart,
        periodEnd,
        paidAt: result.status === 'PAID' ? new Date() : null,
        externalId: result.externalId,
      } as Prisma.SubscriptionInvoiceUncheckedCreateInput,
    });

    if (result.status !== 'PAID') {
      await this.prisma.subscription.update({ where: { id: subscriptionId }, data: { status: SubscriptionStatus.PAST_DUE } });
    }

    return result;
  }

  /** Job diário: cobra de novo toda assinatura paga cujo período corrente já venceu. */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async runRecurringBilling() {
    // Sob lock, e este é o mais grave dos três: sem ele, duas instâncias
    // cobram o cartão do mesmo cliente duas vezes na mesma manhã.
    await this.jobLock.runExclusively('billing:recurring', async () => {
      const due = await this.prisma.subscription.findMany({
        where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] }, currentPeriodEnd: { lte: new Date() } },
        include: { plan: true },
      });

      for (const subscription of due) {
        const now = new Date();
        const periodEnd = addDays(now, SUBSCRIPTION_PERIOD_DAYS);
        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await this.chargeSubscription(subscription.id, subscription.tenantId, Number(subscription.plan.priceMonthly), now, periodEnd);
          if (result.status === 'PAID') {
            // eslint-disable-next-line no-await-in-loop
            await this.prisma.subscription.update({
              where: { id: subscription.id },
              data: { status: SubscriptionStatus.ACTIVE, currentPeriodStart: now, currentPeriodEnd: periodEnd },
            });
          }
        } catch (error) {
          this.logger.error(`Falha ao cobrar a assinatura ${subscription.id}`, error as Error);
        }
      }
    });
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
