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
      subscriptionInvoice: { create: jest.fn().mockResolvedValue({}) },
      tenant: { update: jest.fn().mockResolvedValue({}) },
    };
    provider = { charge: jest.fn() };
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
      expect(provider.charge).not.toHaveBeenCalled();
      expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: 'tenant-1' }, data: { status: 'ACTIVE' } });
    });

    it('cobra a primeira fatura e ativa a assinatura quando o plano é pago', async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: 'plan-pro', key: 'pro', priceMonthly: 199 });
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue({ id: 'sub-2' });
      prisma.subscription.findUniqueOrThrow.mockResolvedValue({ id: 'sub-2', status: 'ACTIVE' });
      provider.charge.mockResolvedValue({ externalId: 'ext-1', status: 'PAID' });

      await service.subscribe('tenant-1', 'pro');

      expect(provider.charge).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1', amount: 199 }));
      expect(prisma.subscriptionInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PAID', amount: 199 }) }),
      );
    });

    it('atualiza (em vez de criar) quando o tenant já tem assinatura', async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: 'plan-premium', key: 'premium', priceMonthly: 399 });
      prisma.subscription.findUnique.mockResolvedValue({ id: 'sub-existing' });
      prisma.subscription.update.mockResolvedValue({ id: 'sub-existing' });
      prisma.subscription.findUniqueOrThrow.mockResolvedValue({ id: 'sub-existing', status: 'ACTIVE' });
      provider.charge.mockResolvedValue({ externalId: 'ext-2', status: 'PAID' });

      await service.subscribe('tenant-1', 'premium');

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-1' } }),
      );
      expect(prisma.subscription.create).not.toHaveBeenCalled();
    });

    it('marca a assinatura como PAST_DUE quando a cobrança falha', async () => {
      prisma.plan.findUnique.mockResolvedValue({ id: 'plan-pro', key: 'pro', priceMonthly: 199 });
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue({ id: 'sub-3' });
      prisma.subscription.findUniqueOrThrow.mockResolvedValue({ id: 'sub-3', status: 'PAST_DUE' });
      provider.charge.mockResolvedValue({ externalId: 'ext-3', status: 'FAILED' });

      await service.subscribe('tenant-1', 'pro');

      expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { id: 'sub-3' }, data: { status: 'PAST_DUE' } });
    });
  });

  describe('runRecurringBilling', () => {
    it('cobra assinaturas vencidas e avança o período quando a cobrança é aprovada', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        { id: 'sub-1', tenantId: 'tenant-1', plan: { priceMonthly: 199 } },
      ]);
      provider.charge.mockResolvedValue({ externalId: 'ext-4', status: 'PAID' });

      await service.runRecurringBilling();

      expect(prisma.subscriptionInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ subscriptionId: 'sub-1', status: 'PAID' }) }),
      );
      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sub-1' }, data: expect.objectContaining({ status: 'ACTIVE' }) }),
      );
    });

    it('não derruba o job inteiro quando uma cobrança falha — continua para as próximas', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        { id: 'sub-1', tenantId: 'tenant-1', plan: { priceMonthly: 199 } },
        { id: 'sub-2', tenantId: 'tenant-2', plan: { priceMonthly: 399 } },
      ]);
      provider.charge
        .mockRejectedValueOnce(new Error('provedor fora do ar'))
        .mockResolvedValueOnce({ externalId: 'ext-5', status: 'PAID' });

      await expect(service.runRecurringBilling()).resolves.toBeUndefined();

      expect(provider.charge).toHaveBeenCalledTimes(2);
    });

    it('não avança o período quando a cobrança recorrente falha', async () => {
      prisma.subscription.findMany.mockResolvedValue([
        { id: 'sub-1', tenantId: 'tenant-1', plan: { priceMonthly: 199 } },
      ]);
      provider.charge.mockResolvedValue({ externalId: 'ext-6', status: 'FAILED' });

      await service.runRecurringBilling();

      expect(prisma.subscription.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { status: 'PAST_DUE' } });
      expect(prisma.subscription.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }),
      );
    });
  });
});
