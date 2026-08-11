import { NotFoundException } from '@nestjs/common';
import { ServiceOrderStatus } from '@prisma/client';
import { ServiceOrdersService } from './service-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';

describe('ServiceOrdersService', () => {
  let service: ServiceOrdersService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let salesService: any;

  beforeEach(() => {
    prisma = {
      serviceOrder: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    salesService = { createFromServiceOrder: jest.fn() };
    service = new ServiceOrdersService(prisma as unknown as PrismaService, salesService as unknown as SalesService);
  });

  describe('updateStatus', () => {
    it('rejeita quando a ordem de serviço não existe', async () => {
      prisma.serviceOrder.findUnique.mockResolvedValue(null);
      await expect(service.updateStatus('so-1', ServiceOrderStatus.DONE)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.serviceOrder.update).not.toHaveBeenCalled();
    });

    it('atualiza o status quando a ordem existe', async () => {
      prisma.serviceOrder.findUnique.mockResolvedValue({ id: 'so-1', status: ServiceOrderStatus.OPEN, saleId: null, items: [] });
      prisma.serviceOrder.update.mockResolvedValue({ id: 'so-1', status: ServiceOrderStatus.IN_PROGRESS });

      await service.updateStatus('so-1', ServiceOrderStatus.IN_PROGRESS);

      expect(prisma.serviceOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'so-1' }, data: { status: ServiceOrderStatus.IN_PROGRESS } }),
      );
      expect(salesService.createFromServiceOrder).not.toHaveBeenCalled();
    });

    it('gera a venda automaticamente ao concluir (DONE) uma ordem sem venda ainda', async () => {
      const serviceOrder = {
        id: 'so-1',
        status: ServiceOrderStatus.IN_PROGRESS,
        saleId: null,
        customerId: 'customer-1',
        items: [{ productId: 'product-1', description: 'Radiador', quantity: 1, unitPrice: 360 }],
      };
      prisma.serviceOrder.findUnique.mockResolvedValue(serviceOrder);
      salesService.createFromServiceOrder.mockResolvedValue({ id: 'sale-1' });
      prisma.serviceOrder.update.mockResolvedValue({ id: 'so-1', status: ServiceOrderStatus.DONE, saleId: 'sale-1' });

      await service.updateStatus('so-1', ServiceOrderStatus.DONE);

      expect(salesService.createFromServiceOrder).toHaveBeenCalledWith(serviceOrder);
      expect(prisma.serviceOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'so-1' }, data: { saleId: 'sale-1' } }),
      );
      expect(prisma.serviceOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'so-1' }, data: { status: ServiceOrderStatus.DONE } }),
      );
    });

    it('não gera venda de novo se a ordem já tem uma venda vinculada', async () => {
      const serviceOrder = {
        id: 'so-1',
        status: ServiceOrderStatus.DONE,
        saleId: 'sale-existente',
        customerId: 'customer-1',
        items: [],
      };
      prisma.serviceOrder.findUnique.mockResolvedValue(serviceOrder);
      prisma.serviceOrder.update.mockResolvedValue({ id: 'so-1', status: ServiceOrderStatus.DONE });

      await service.updateStatus('so-1', ServiceOrderStatus.DONE);

      expect(salesService.createFromServiceOrder).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('rejeita quando não encontrada', async () => {
      prisma.serviceOrder.findUnique.mockResolvedValue(null);
      await expect(service.findOne('so-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('schedule', () => {
    it('rejeita quando a ordem de serviço não existe', async () => {
      prisma.serviceOrder.findUnique.mockResolvedValue(null);
      await expect(service.schedule('so-1', '2026-08-15T10:00:00.000Z')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('agenda a ordem de serviço para a data informada', async () => {
      prisma.serviceOrder.findUnique.mockResolvedValue({ id: 'so-1' });
      prisma.serviceOrder.update.mockResolvedValue({ id: 'so-1', scheduledAt: new Date('2026-08-15T10:00:00.000Z') });

      await service.schedule('so-1', '2026-08-15T10:00:00.000Z');

      expect(prisma.serviceOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'so-1' }, data: { scheduledAt: new Date('2026-08-15T10:00:00.000Z') } }),
      );
    });

    it('remove o agendamento quando nenhuma data é informada', async () => {
      prisma.serviceOrder.findUnique.mockResolvedValue({ id: 'so-1' });
      prisma.serviceOrder.update.mockResolvedValue({ id: 'so-1', scheduledAt: null });

      await service.schedule('so-1', undefined);

      expect(prisma.serviceOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'so-1' }, data: { scheduledAt: null } }),
      );
    });
  });
});
