import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StockCountsService } from './stock-counts.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from './stock.service';

describe('StockCountsService', () => {
  let service: StockCountsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stockService: any;

  beforeEach(() => {
    prisma = {
      warehouse: { findUnique: jest.fn() },
      product: { findMany: jest.fn() },
      stockCount: {
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(() => prisma.stockCount.findUnique()),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        // Semântica do banco: fechar/cancelar só 'pega' com a contagem ABERTA.
        updateMany: jest.fn(async ({ where, data }: any) => {
          const atual = await prisma.stockCount.findUnique();
          if (!atual) return { count: 0 };
          if (where.status && atual.status !== where.status) return { count: 0 };
          Object.assign(atual, data);
          return { count: 1 };
        }),
      },
      stockCountItem: { createMany: jest.fn().mockResolvedValue({}), update: jest.fn() },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    stockService = { performAdjust: jest.fn().mockResolvedValue(undefined) };
    service = new StockCountsService(prisma as unknown as PrismaService, stockService as unknown as StockService);
  });

  describe('create', () => {
    it('rejeita depósito inexistente', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);
      await expect(service.create('user-1', { warehouseId: 'warehouse-1' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita quando nenhum produto é encontrado para contar', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({ id: 'warehouse-1' });
      prisma.product.findMany.mockResolvedValue([]);
      await expect(service.create('user-1', { warehouseId: 'warehouse-1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tira uma foto (expectedQty) da quantidade atual de cada produto no depósito', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({ id: 'warehouse-1' });
      prisma.product.findMany.mockResolvedValue([
        { id: 'product-1', stockItems: [{ quantity: 10 }] },
        { id: 'product-2', stockItems: [] },
      ]);
      prisma.stockCount.create.mockResolvedValue({ id: 'count-1' });
      prisma.stockCount.findUniqueOrThrow.mockResolvedValue({ id: 'count-1', items: [] });

      await service.create('user-1', { warehouseId: 'warehouse-1' });

      expect(prisma.stockCountItem.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({ productId: 'product-1', expectedQty: 10 }),
            expect.objectContaining({ productId: 'product-2', expectedQty: 0 }),
          ],
        }),
      );
    });
  });

  describe('complete', () => {
    it('rejeita contagem que não está mais aberta', async () => {
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1', status: 'COMPLETED', items: [] });
      await expect(service.complete('count-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('só ajusta o estoque dos itens contados que divergem do esperado', async () => {
      prisma.stockCount.findUnique.mockResolvedValue({
        id: 'count-1',
        status: 'OPEN',
        warehouseId: 'warehouse-1',
        items: [
          { id: 'item-1', productId: 'product-1', expectedQty: 10, countedQty: 10 }, // bateu, não ajusta
          { id: 'item-2', productId: 'product-2', expectedQty: 5, countedQty: 3 }, // divergiu, ajusta
          { id: 'item-3', productId: 'product-3', expectedQty: 8, countedQty: null }, // não contado, ignora
        ],
      });
      prisma.stockCount.update.mockResolvedValue({ id: 'count-1', status: 'COMPLETED' });

      await service.complete('count-1', 'user-1');

      expect(stockService.performAdjust).toHaveBeenCalledTimes(1);
      expect(stockService.performAdjust).toHaveBeenCalledWith(
        prisma,
        'user-1',
        expect.objectContaining({ productId: 'product-2', type: 'ADJUSTMENT', quantity: 3 }),
      );
      expect(prisma.stockCount.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'count-1', status: 'OPEN' }, data: expect.objectContaining({ status: 'COMPLETED' }) }),
      );
    });
  });

  describe('cancel', () => {
    it('rejeita contagem que não está mais aberta', async () => {
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1', status: 'CANCELED', items: [] });
      await expect(service.cancel('count-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cancela uma contagem aberta', async () => {
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1', status: 'OPEN', items: [] });
      prisma.stockCount.update.mockResolvedValue({ id: 'count-1', status: 'CANCELED' });

      await service.cancel('count-1');

      expect(prisma.stockCount.updateMany).toHaveBeenCalledWith({ where: { id: 'count-1', status: 'OPEN' }, data: { status: 'CANCELED' } });
    });
  });

  describe('setCountedQty', () => {
    it('rejeita item que não pertence à contagem', async () => {
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1', status: 'OPEN', items: [{ id: 'item-1' }] });
      await expect(service.setCountedQty('count-1', 'item-inexistente', 5)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
