import { jobLockAlwaysGrants } from '../common/scheduling/job-lock.test-double';
import { NotFoundException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingProvider } from './billing-provider.interface';

describe('BillingService', () => {
  let service: BillingService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let provider: any;

  beforeEach(() => {
    prisma = {
      plan: { findMany: jest.fn(), findUnique: jest.fn() },
      subscription: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      subscriptionInvoice: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      tenant: {
        update: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          name: 'Oficina do Zé',
          document: '12345678000195',
          billingExternalId: null,
          users: [{ email: 'ze@oficina.com.br' }],
        }),
      },
    };
    provider = { criarCobranca: jest.fn(), interpretarWebhook: jest.fn() };
    service = new BillingService(
      prisma as unknown as PrismaService,
      provider as unknown as BillingProvider,
      jobLockAlwaysGrants(),
    );
  });

  describe('subscribe', () => {
    it('rejeita quando o plano não existe', async () => {
      prisma.plan.findUnique.mockResolvedValue(null);
      await expect(service.subscribe('tenant-1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cria a assinatura sem cobrar quando o plano é gratuito (trial)', async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: 'plan-trial', key: 'trial', priceMonthly: 0 });
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue({ id: 'sub-1' });
      prisma.subscription.findUniqueOrThrow.mockResolvedValue({ id: 'sub-1', status: 'TRIALING' });

      await service.subscribe('tenant-1', 'trial');

      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1', status: 'TRIALING' }) }),
      );
      expect(provider.criarCobranca).not.toHaveBeenCalled();
      expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: 'tenant-1' }, data: { status: 'ACTIVE' } });
    });

    it('emite a cobrança quando o plano é pago, guardando o link de pagamento', async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: 'plan-pro', key: 'pro', priceMonthly: 199 });
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue({ id: 'sub-2' });
      prisma.subscription.findUniqueOrThrow.mockResolvedValue({ id: 'sub-2', status: 'ACTIVE' });
      provider.criarCobranca.mockResolvedValue({
        externalId: 'pay_1',
        status: 'PENDING',
        paymentUrl: 'https://asaas/f/pay_1',
      });

      await service.subscribe('tenant-1', 'pro');

      expect(provider.criarCobranca).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1', amount: 199 }));
      expect(prisma.subscriptionInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING', amount: 199, paymentUrl: 'https://asaas/f/pay_1' }),
        }),
      );
    });

    it('NÃO marca a assinatura como atrasada por a cobrança estar pendente', async () => {
      // Boleto e PIX nascem pendentes: tratar isso como inadimplência
      // suspenderia todo cliente no instante em que ele contrata o plano.
      prisma.plan.findUnique.mockResolvedValue({ id: 'plan-pro', key: 'pro', priceMonthly: 199 });
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue({ id: 'sub-2' });
      prisma.subscription.findUniqueOrThrow.mockResolvedValue({ id: 'sub-2', status: 'ACTIVE' });
      provider.criarCobranca.mockResolvedValue({ externalId: 'pay_1', status: 'PENDING' });

      await service.subscribe('tenant-1', 'pro');

      expect(prisma.subscription.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PAST_DUE' }) }),
      );
    });

    it('guarda o id do pagador devolvido pelo provedor', async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: 'plan-pro', key: 'pro', priceMonthly: 199 });
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue({ id: 'sub-2' });
      prisma.subscription.findUniqueOrThrow.mockResolvedValue({ id: 'sub-2' });
      provider.criarCobranca.mockResolvedValue({ externalId: 'pay_1', status: 'PENDING', pagadorExternalId: 'cus_9' });

      await service.subscribe('tenant-1', 'pro');

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-1' },
        data: { billingExternalId: 'cus_9' },
      });
    });

    it('reaproveita o pagador já cadastrado em vez de mandar criar outro', async () => {
      prisma.tenant.findUniqueOrThrow.mockResolvedValue({
        id: 'tenant-1',
        name: 'Oficina',
        document: '12345678000195',
        billingExternalId: 'cus_ja_existe',
        users: [{ email: 'a@b.c' }],
      });
      prisma.plan.findUnique.mockResolvedValue({ id: 'plan-pro', key: 'pro', priceMonthly: 199 });
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue({ id: 'sub-2' });
      prisma.subscription.findUniqueOrThrow.mockResolvedValue({ id: 'sub-2' });
      provider.criarCobranca.mockResolvedValue({
        externalId: 'pay_1',
        status: 'PENDING',
        pagadorExternalId: 'cus_ja_existe',
      });

      await service.subscribe('tenant-1', 'pro');

      expect(provider.criarCobranca).toHaveBeenCalledWith(
        expect.objectContaining({ pagadorExternalId: 'cus_ja_existe' }),
      );
      // E não regrava o mesmo valor à toa.
      expect(prisma.tenant.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ billingExternalId: expect.anything() }) }),
      );
    });

    it('marca a assinatura como PAST_DUE quando a cobrança é recusada de vez', async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: 'plan-pro', key: 'pro', priceMonthly: 199 });
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue({ id: 'sub-3' });
      prisma.subscription.findUniqueOrThrow.mockResolvedValue({ id: 'sub-3', status: 'PAST_DUE' });
      provider.criarCobranca.mockResolvedValue({ externalId: 'pay_3', status: 'FAILED' });

      await service.subscribe('tenant-1', 'pro');

      expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { id: 'sub-3' }, data: { status: 'PAST_DUE' } });
    });
  });

  describe('runRecurringBilling', () => {
    it('cobra assinaturas vencidas e avança o período quando a cobrança é aprovada', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        { id: 'sub-1', tenantId: 'tenant-1', status: 'ACTIVE', plan: { priceMonthly: 199 } },
      ]);
      provider.criarCobranca.mockResolvedValue({ externalId: 'pay_4', status: 'PAID' });

      await service.runRecurringBilling();

      expect(prisma.subscriptionInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ subscriptionId: 'sub-1', status: 'PAID' }) }),
      );
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sub-1' }, data: expect.objectContaining({ status: 'ACTIVE' }) }),
      );
    });

    it('NÃO emite segunda cobrança quando já existe uma em aberto', async () => {
      // O defeito que isto trava: com boleto pendente, o job rodaria de novo
      // amanhã e emitiria outro. Em uma semana o cliente teria sete cobranças
      // da mesma mensalidade — e o dinheiro voltaria como estorno e reclamação.
      prisma.subscription.findMany.mockResolvedValue([
        { id: 'sub-1', tenantId: 'tenant-1', status: 'ACTIVE', plan: { priceMonthly: 199 } },
      ]);
      prisma.subscriptionInvoice.findFirst.mockResolvedValue({ id: 'inv-aberta', status: 'PENDING' });

      await service.runRecurringBilling();

      expect(provider.criarCobranca).not.toHaveBeenCalled();
      expect(prisma.subscriptionInvoice.create).not.toHaveBeenCalled();
    });

    it('avança o período mesmo com a cobrança pendente, para não recobrar amanhã', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        { id: 'sub-1', tenantId: 'tenant-1', status: 'ACTIVE', plan: { priceMonthly: 199 } },
      ]);
      provider.criarCobranca.mockResolvedValue({ externalId: 'pay_5', status: 'PENDING' });

      await service.runRecurringBilling();

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-1' },
          data: expect.objectContaining({ currentPeriodEnd: expect.any(Date) }),
        }),
      );
    });

    it('não derruba o job inteiro quando uma cobrança falha — continua para as próximas', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        { id: 'sub-1', tenantId: 'tenant-1', status: 'ACTIVE', plan: { priceMonthly: 199 } },
        { id: 'sub-2', tenantId: 'tenant-2', status: 'ACTIVE', plan: { priceMonthly: 399 } },
      ]);
      provider.criarCobranca
        .mockRejectedValueOnce(new Error('provedor fora do ar'))
        .mockResolvedValueOnce({ externalId: 'pay_6', status: 'PAID' });

      await expect(service.runRecurringBilling()).resolves.toBeUndefined();

      expect(provider.criarCobranca).toHaveBeenCalledTimes(2);
    });

    it('não avança o período quando a cobrança recorrente é recusada', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        { id: 'sub-1', tenantId: 'tenant-1', status: 'ACTIVE', plan: { priceMonthly: 199 } },
      ]);
      provider.criarCobranca.mockResolvedValue({ externalId: 'pay_7', status: 'FAILED' });

      await service.runRecurringBilling();

      expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { status: 'PAST_DUE' } });
      expect(prisma.subscription.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ currentPeriodEnd: expect.any(Date) }) }),
      );
    });
  });

  describe('aplicarEventoDeCobranca', () => {
    function cobrancaExistente(status = 'PENDING') {
      prisma.subscriptionInvoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        subscriptionId: 'sub-1',
        tenantId: 'tenant-1',
        status,
      });
    }

    it('pagamento confirmado marca a fatura como paga e reativa a assinatura', async () => {
      cobrancaExistente();

      await service.aplicarEventoDeCobranca({ externalId: 'pay_1', status: 'PAID' });

      expect(prisma.subscriptionInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: 'PAID', paidAt: expect.any(Date) },
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { status: 'ACTIVE' } });
      expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: 'tenant-1' }, data: { status: 'ACTIVE' } });
    });

    it('reprocessar o mesmo pagamento não mexe em nada', async () => {
      // O provedor reenvia o webhook até receber 200. Sem esta guarda, cada
      // reenvio reescreveria paidAt e a data de pagamento viraria ficção.
      cobrancaExistente('PAID');

      await service.aplicarEventoDeCobranca({ externalId: 'pay_1', status: 'PAID' });

      expect(prisma.subscriptionInvoice.update).not.toHaveBeenCalled();
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });

    it('vencimento coloca a assinatura em atraso', async () => {
      cobrancaExistente();

      await service.aplicarEventoDeCobranca({ externalId: 'pay_1', status: 'FAILED' });

      expect(prisma.subscriptionInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: 'FAILED' },
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { status: 'PAST_DUE' } });
    });

    it('ignora cobrança que não é nossa, sem erro', async () => {
      // Erro aqui viraria 500, e o provedor reenviaria o mesmo evento para
      // sempre. Não é nosso: não é falha.
      prisma.subscriptionInvoice.findFirst.mockResolvedValue(null);

      await expect(service.aplicarEventoDeCobranca({ externalId: 'pay_de_outro', status: 'PAID' })).resolves
        .toBeUndefined();
      expect(prisma.subscriptionInvoice.update).not.toHaveBeenCalled();
    });
  });
});
