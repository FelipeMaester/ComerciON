import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, SubscriptionStatus, TenantStatus } from '@prisma/client';
import { JobLockService } from '../common/scheduling/job-lock.service';
import { PrismaService } from '../prisma/prisma.service';
import { BILLING_PROVIDER, BillingProvider, EventoDeCobranca } from './billing-provider.interface';

const SUBSCRIPTION_PERIOD_DAYS = 30;

// Prazo que o cliente tem para pagar o boleto/PIX da mensalidade. Menor que o
// período de serviço de propósito: dá tempo de o webhook de vencimento chegar
// antes de o próximo ciclo começar.
const DIAS_PARA_VENCIMENTO = 5;

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
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { users: { where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, take: 1 } },
    });

    const result = await this.provider.criarCobranca({
      tenantId,
      amount,
      description: `Assinatura — período ${periodStart.toISOString().slice(0, 10)} a ${periodEnd.toISOString().slice(0, 10)}`,
      vencimento: addDays(periodStart, DIAS_PARA_VENCIMENTO),
      pagador: {
        nome: tenant.name,
        documento: tenant.document,
        email: tenant.users[0]?.email ?? '',
      },
      pagadorExternalId: tenant.billingExternalId,
    });

    // Guardar o id do pagador evita duplicar o mesmo cliente no provedor a
    // cada mensalidade — o que sujaria o relatório dele e a conciliação.
    if (result.pagadorExternalId && result.pagadorExternalId !== tenant.billingExternalId) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { billingExternalId: result.pagadorExternalId },
      });
    }

    await this.prisma.subscriptionInvoice.create({
      data: {
        subscriptionId,
        tenantId,
        amount,
        status: result.status,
        periodStart,
        periodEnd,
        dueDate: addDays(periodStart, DIAS_PARA_VENCIMENTO),
        paidAt: result.status === 'PAID' ? new Date() : null,
        externalId: result.externalId,
        paymentUrl: result.paymentUrl,
      } as Prisma.SubscriptionInvoiceUncheckedCreateInput,
    });

    // PENDING é o estado normal de um boleto/PIX recém-emitido, NÃO
    // inadimplência: marcar PAST_DUE aqui suspenderia todo cliente no
    // instante em que ele contrata. Quem move para PAST_DUE é o webhook de
    // vencimento (PAYMENT_OVERDUE).
    if (result.status === 'FAILED') {
      await this.prisma.subscription.update({ where: { id: subscriptionId }, data: { status: SubscriptionStatus.PAST_DUE } });
    }

    return result;
  }

  /**
   * Aplica o que o webhook do provedor contou sobre uma cobrança.
   *
   * Idempotente de propósito: provedor reenvia webhook quando não recebe 200,
   * e o mesmo pagamento chega várias vezes. Reprocessar não pode mexer em
   * paidAt nem reabrir período já estendido.
   */
  async aplicarEventoDeCobranca(evento: EventoDeCobranca) {
    const invoice = await this.prisma.subscriptionInvoice.findFirst({
      where: { externalId: evento.externalId },
      include: { subscription: true },
    });

    if (!invoice) {
      // Cobrança que não é nossa, ou de um ambiente diferente (sandbox
      // apontando para a mesma URL). Ignorar em silêncio é o certo — só não
      // pode ser um erro, senão o provedor fica reenviando para sempre.
      this.logger.warn(`Webhook de cobrança desconhecida (${evento.externalId}) — ignorado.`);
      return;
    }

    if (invoice.status === 'PAID' && evento.status === 'PAID') return;

    if (evento.status === 'PAID') {
      await this.prisma.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: { status: 'PAID', paidAt: new Date() },
      });
      await this.prisma.subscription.update({
        where: { id: invoice.subscriptionId },
        data: { status: SubscriptionStatus.ACTIVE },
      });
      await this.prisma.tenant.update({ where: { id: invoice.tenantId }, data: { status: TenantStatus.ACTIVE } });
      this.logger.log(`Cobrança ${evento.externalId} paga — assinatura ${invoice.subscriptionId} ativa.`);
      return;
    }

    if (evento.status === 'FAILED') {
      await this.prisma.subscriptionInvoice.update({ where: { id: invoice.id }, data: { status: 'FAILED' } });
      await this.prisma.subscription.update({
        where: { id: invoice.subscriptionId },
        data: { status: SubscriptionStatus.PAST_DUE },
      });
      this.logger.warn(`Cobrança ${evento.externalId} vencida ou cancelada — assinatura em atraso.`);
    }
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
          // Já existe cobrança em aberto para este assinante? Então ela ainda
          // está no prazo de pagamento e não se emite outra. Sem esta trava,
          // um boleto pendente faria o job gerar um boleto NOVO toda manhã —
          // o cliente com sete cobranças da mesma mensalidade na conta.
          // eslint-disable-next-line no-await-in-loop
          const emAberto = await this.prisma.subscriptionInvoice.findFirst({
            where: { subscriptionId: subscription.id, status: 'PENDING' },
          });
          if (emAberto) {
            this.logger.log(`Assinatura ${subscription.id} já tem cobrança em aberto — não emite outra.`);
            continue;
          }

          // eslint-disable-next-line no-await-in-loop
          const result = await this.chargeSubscription(subscription.id, subscription.tenantId, Number(subscription.plan.priceMonthly), now, periodEnd);

          // O período avança quando a cobrança é EMITIDA, não quando é paga.
          // Duas razões: o cliente já foi cobrado por esse período, e sem
          // avançar a assinatura continuaria "vencida" e o job tentaria de
          // novo amanhã. Quem não pagar cai em PAST_DUE pelo webhook de
          // vencimento.
          if (result.status !== 'FAILED') {
            // eslint-disable-next-line no-await-in-loop
            await this.prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                status: result.status === 'PAID' ? SubscriptionStatus.ACTIVE : subscription.status,
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
              },
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
