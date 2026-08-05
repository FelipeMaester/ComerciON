import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StockService } from './stock.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StockService', () => {
  let service: StockService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const product = { id: 'product-1' };
  const warehouse = { id: 'warehouse-1' };

  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      warehouse: { findUnique: jest.fn().mockResolvedValue(warehouse) },
      stockItem: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    service = new StockService(prisma as unknown as PrismaService);
  });

  describe('adjust', () => {
    it('soma quantidade em movimentação IN', async () => {
      prisma.stockItem.upsert.mockResolvedValue({ id: 'si-1', quantity: 10 });
      prisma.stockMovement.create.mockImplementation((args: any) => args.data);

      const result = await service.adjust('user-1', {
        productId: 'product-1',
        warehouseId: 'warehouse-1',
        type: 'IN',
        quantity: 5,
      });

      expect(prisma.stockItem.update).toHaveBeenCalledWith({ where: { id: 'si-1' }, data: { quantity: 15 } });
      expect(result.newQuantity).toBe(15);
      expect(result.previousQuantity).toBe(10);
    });

    it('rejeita OUT maior que a quantidade disponível, sem alterar o estoque', async () => {
      prisma.stockItem.upsert.mockResolvedValue({ id: 'si-1', quantity: 3 });

      await expect(
        service.adjust('user-1', {
          productId: 'product-1',
          warehouseId: 'warehouse-1',
          type: 'OUT',
          quantity: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.stockItem.update).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('ADJUSTMENT define a quantidade final como valor absoluto (não soma)', async () => {
      prisma.stockItem.upsert.mockResolvedValue({ id: 'si-1', quantity: 50 });
      prisma.stockMovement.create.mockImplementation((args: any) => args.data);

      const result = await service.adjust('user-1', {
        productId: 'product-1',
        warehouseId: 'warehouse-1',
        type: 'ADJUSTMENT',
        quantity: 7,
      });

      expect(result.newQuantity).toBe(7);
      expect(prisma.stockItem.update).toHaveBeenCalledWith({ where: { id: 'si-1' }, data: { quantity: 7 } });
    });

    it('lança NotFoundException se o produto não existir', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.adjust('user-1', { productId: 'ghost', warehouseId: 'warehouse-1', type: 'IN', quantity: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('transfer', () => {
    it('rejeita transferência para o mesmo depósito', async () => {
      await expect(
        service.transfer('user-1', {
          productId: 'product-1',
          sourceWarehouseId: 'warehouse-1',
          destWarehouseId: 'warehouse-1',
          quantity: 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('move quantidade do depósito de origem para o destino atomicamente', async () => {
      prisma.stockItem.upsert
        .mockResolvedValueOnce({ id: 'source-item', quantity: 20 })
        .mockResolvedValueOnce({ id: 'dest-item', quantity: 5 });
      prisma.stockMovement.create.mockImplementation((args: any) => args.data);

      const result = await service.transfer('user-1', {
        productId: 'product-1',
        sourceWarehouseId: 'warehouse-1',
        destWarehouseId: 'warehouse-2',
        quantity: 8,
      });

      expect(result.sourceQuantity).toBe(12);
      expect(result.destQuantity).toBe(13);
      expect(prisma.stockItem.update).toHaveBeenNthCalledWith(1, { where: { id: 'source-item' }, data: { quantity: 12 } });
      expect(prisma.stockItem.update).toHaveBeenNthCalledWith(2, { where: { id: 'dest-item' }, data: { quantity: 13 } });
      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
    });

    it('rejeita transferência com quantidade insuficiente na origem e não toca o destino', async () => {
      prisma.stockItem.upsert.mockResolvedValueOnce({ id: 'source-item', quantity: 2 });

      await expect(
        service.transfer('user-1', {
          productId: 'product-1',
          sourceWarehouseId: 'warehouse-1',
          destWarehouseId: 'warehouse-2',
          quantity: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.stockItem.update).not.toHaveBeenCalled();
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
      // upsert só deve ter sido chamado uma vez (origem) — nunca chegou a mexer no destino
      expect(prisma.stockItem.upsert).toHaveBeenCalledTimes(1);
    });
  });
});
