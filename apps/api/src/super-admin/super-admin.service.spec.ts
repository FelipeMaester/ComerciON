import { NotFoundException } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

describe('SuperAdminService', () => {
  let service: SuperAdminService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let billingService: any;

  beforeEach(() => {
    prisma = { tenant: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() } };
    billingService = { subscribe: jest.fn() };
    service = new SuperAdminService(prisma as unknown as PrismaService, billingService as unknown as BillingService);
  });

  describe('getTenant', () => {
    it('lança NotFoundException quando o tenant não existe', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.getTenant('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('devolve o tenant com a assinatura e as faturas', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 't1', name: 'Demo', subscription: { plan: { key: 'pro' } } });
      const result = await service.getTenant('t1');
      expect(result).toEqual({ id: 't1', name: 'Demo', subscription: { plan: { key: 'pro' } } });
    });
  });

  describe('updateStatus', () => {
    it('rejeita quando o tenant não existe', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.updateStatus('ghost', 'SUSPENDED')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });

    it('atualiza o status do tenant existente', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 't1' });
      prisma.tenant.update.mockResolvedValue({ id: 't1', status: 'SUSPENDED' });

      await service.updateStatus('t1', 'SUSPENDED');

      expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'SUSPENDED' } });
    });
  });

  describe('changePlan', () => {
    it('rejeita quando o tenant não existe', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.changePlan('ghost', 'pro')).rejects.toBeInstanceOf(NotFoundException);
      expect(billingService.subscribe).not.toHaveBeenCalled();
    });

    it('delega para o BillingService quando o tenant existe', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 't1' });
      billingService.subscribe.mockResolvedValue({ id: 'sub-1' });

      const result = await service.changePlan('t1', 'premium');

      expect(billingService.subscribe).toHaveBeenCalledWith('t1', 'premium');
      expect(result).toEqual({ id: 'sub-1' });
    });
  });
});
