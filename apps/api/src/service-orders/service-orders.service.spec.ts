import { NotFoundException } from '@nestjs/common';
import { ServiceOrderStatus } from '@prisma/client';
import { ServiceOrdersService } from './service-orders.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ServiceOrdersService', () => {
  let service: ServiceOrdersService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(() => {
    prisma = {
      serviceOrder: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    service = new ServiceOrdersService(prisma as unknown as PrismaService);
  });

  describe('updateStatus', () => {
    it('rejeita quando a ordem de serviço não existe', async () => {
      prisma.serviceOrder.findUnique.mockResolvedValue(null);
      await expect(service.updateStatus('so-1', ServiceOrderStatus.DONE)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.serviceOrder.update).not.toHaveBeenCalled();
    });

    it('atualiza o status quando a ordem existe', async () => {
      prisma.serviceOrder.findUnique.mockResolvedValue({ id: 'so-1' });
      prisma.serviceOrder.update.mockResolvedValue({ id: 'so-1', status: ServiceOrderStatus.DONE });

      await service.updateStatus('so-1', ServiceOrderStatus.DONE);

      expect(prisma.serviceOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'so-1' }, data: { status: ServiceOrderStatus.DONE } }),
      );
    });
  });

  describe('findOne', () => {
    it('rejeita quando não encontrada', async () => {
      prisma.serviceOrder.findUnique.mockResolvedValue(null);
      await expect(service.findOne('so-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
