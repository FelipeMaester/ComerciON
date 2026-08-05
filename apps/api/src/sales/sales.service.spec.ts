import { BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../inventory/stock.service';
import { CouponsService } from '../coupons/coupons.service';
import { AutomationsService } from '../whatsapp/automations.service';

describe('SalesService', () => {
  let service: SalesService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stockService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let couponsService: any;
  let automationsService: { sendOrderConfirmation: jest.Mock };

  const warehouse = { id: 'warehouse-1' };
  const product = { id: 'product-1', retailPrice: 100, wholesalePrice: 80 };

  beforeEach(() => {
    stockService = { performAdjust: jest.fn().mockResolvedValue(undefined) };
    couponsService = {
      validate: jest.fn(),
      incrementUsage: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      warehouse: { findUnique: jest.fn().mockResolvedValue(warehouse) },
      customer: { findUnique: jest.fn() },
      product: { findMany: jest.fn().mockResolvedValue([product]) },
      sale: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      saleItem: { createMany: jest.fn().mockResolvedValue({}) },
      salePayment: { createMany: jest.fn().mockResolvedValue({}) },
      financialEntry: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    automationsService = { sendOrderConfirmation: jest.fn().mockResolvedValue(undefined) };

    service = new SalesService(
      prisma as unknown as PrismaService,
      stockService as unknown as StockService,
      couponsService as unknown as CouponsService,
      automationsService as unknown as AutomationsService,
    );
  });

  describe('create', () => {
    const baseDto = {
      warehouseId: 'warehouse-1',
      items: [{ productId: 'product-1', quantity: 1 }],
    };

    it('cria um orçamento (confirm ausente) sem tocar estoque ou financeiro', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-1' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-1', status: 'QUOTE' });

      const result = await service.create('seller-1', baseDto);

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'QUOTE', total: 100 }) }),
      );
      expect(stockService.performAdjust).not.toHaveBeenCalled();
      expect(prisma.financialEntry.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'sale-1', status: 'QUOTE' });
    });

    it('confirma direto (confirm=true) com pagamento cobrindo o total: baixa estoque e gera conta a receber PAGA', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-2' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-2', status: 'CONFIRMED' });

      await service.create('seller-1', {
        ...baseDto,
        confirm: true,
        payments: [{ method: 'CASH', amount: 100 }],
      });

      expect(stockService.performAdjust).toHaveBeenCalledWith(
        prisma,
        'seller-1',
        expect.objectContaining({ productId: 'product-1', warehouseId: 'warehouse-1', type: 'OUT', quantity: 1 }),
      );
      expect(prisma.financialEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'RECEIVABLE', status: 'PAID', amount: 100 }) }),
      );
    });

    it('soma o frete ao total quando shippingCost é informado', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-freight' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-freight' });

      await service.create('seller-1', { ...baseDto, shippingCost: 25 });

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ shippingCost: 25, total: 125 }) }),
      );
    });

    it('zera o frete no servidor quando o cupom aplicado tem frete grátis, mesmo se o cliente mandou um valor', async () => {
      couponsService.validate.mockResolvedValue({ couponId: 'coupon-free', discountAmount: 0, freeShipping: true });
      prisma.sale.create.mockResolvedValue({ id: 'sale-freeship' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-freeship' });

      await service.create('seller-1', { ...baseDto, couponCode: 'FRETEGRATIS', shippingCost: 40 });

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ shippingCost: 0, total: 100 }) }),
      );
    });

    it('dispara a confirmação por WhatsApp para venda ONLINE confirmada', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-online' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-online' });

      await service.create('seller-1', { ...baseDto, confirm: true, payments: [{ method: 'CASH', amount: 100 }] }, 'ONLINE' as never);

      expect(automationsService.sendOrderConfirmation).toHaveBeenCalledWith('sale-online');
    });

    it('não dispara confirmação por WhatsApp para venda de loja física (STORE)', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-store' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-store' });

      await service.create('seller-1', { ...baseDto, confirm: true, payments: [{ method: 'CASH', amount: 100 }] });

      expect(automationsService.sendOrderConfirmation).not.toHaveBeenCalled();
    });

    it('não dispara confirmação por WhatsApp para orçamento ONLINE ainda não confirmado', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-online-quote' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-online-quote' });

      await service.create('seller-1', baseDto, 'ONLINE' as never);

      expect(automationsService.sendOrderConfirmation).not.toHaveBeenCalled();
    });

    it('aplica desconto do cupom ao subtotal e incrementa o uso ao confirmar', async () => {
      couponsService.validate.mockResolvedValue({ couponId: 'coupon-1', discountAmount: 20, freeShipping: false });
      prisma.sale.create.mockResolvedValue({ id: 'sale-coupon' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-coupon' });

      await service.create('seller-1', {
        ...baseDto,
        couponCode: 'PROMO20',
        confirm: true,
        payments: [{ method: 'CASH', amount: 80 }],
      });

      expect(couponsService.validate).toHaveBeenCalledWith('PROMO20', 100);
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ discount: 20, total: 80, couponId: 'coupon-1' }) }),
      );
      expect(couponsService.incrementUsage).toHaveBeenCalledWith(prisma, 'coupon-1');
    });

    it('não incrementa o uso do cupom quando a venda fica como orçamento (confirm ausente)', async () => {
      couponsService.validate.mockResolvedValue({ couponId: 'coupon-1', discountAmount: 20, freeShipping: false });
      prisma.sale.create.mockResolvedValue({ id: 'sale-quote-coupon' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-quote-coupon' });

      await service.create('seller-1', { ...baseDto, couponCode: 'PROMO20' });

      expect(couponsService.incrementUsage).not.toHaveBeenCalled();
    });

    it('rejeita confirm=true quando os pagamentos não cobrem o total, sem abrir transação', async () => {
      await expect(
        service.create('seller-1', {
          ...baseDto,
          confirm: true,
          payments: [{ method: 'CASH', amount: 50 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejeita confirm=true sem nenhum pagamento informado', async () => {
      await expect(service.create('seller-1', { ...baseDto, confirm: true })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('usa o preço de atacado quando o cliente tem priceTier WHOLESALE', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', priceTier: 'WHOLESALE' });
      prisma.sale.create.mockResolvedValue({ id: 'sale-3' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-3' });

      await service.create('seller-1', { ...baseDto, customerId: 'customer-1' });

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 80 }) }),
      );
    });
  });

  describe('confirm', () => {
    it('rejeita confirmar uma venda que não é orçamento', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', status: 'CONFIRMED', items: [], payments: [] });

      await expect(service.confirm('user-1', 'sale-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(stockService.performAdjust).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('rejeita cancelar uma venda já confirmada (deve usar devolução)', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', status: 'CONFIRMED' });

      await expect(service.cancel('sale-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('returnSale', () => {
    it('rejeita devolver uma venda que não está confirmada', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', status: 'QUOTE', items: [] });

      await expect(service.returnSale('user-1', 'sale-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(stockService.performAdjust).not.toHaveBeenCalled();
    });

    it('devolve uma venda confirmada: repõe estoque (IN) e cancela contas a receber pendentes', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        status: 'CONFIRMED',
        warehouseId: 'warehouse-1',
        items: [{ productId: 'product-1', quantity: 2 }],
      });
      prisma.sale.update.mockResolvedValue({ id: 'sale-1', status: 'RETURNED' });

      const result = await service.returnSale('user-1', 'sale-1');

      expect(stockService.performAdjust).toHaveBeenCalledWith(
        prisma,
        'user-1',
        expect.objectContaining({ productId: 'product-1', type: 'IN', quantity: 2 }),
      );
      expect(prisma.financialEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { saleId: 'sale-1', status: 'PENDING' }, data: { status: 'CANCELED' } }),
      );
      expect(result.status).toBe('RETURNED');
    });
  });
});
