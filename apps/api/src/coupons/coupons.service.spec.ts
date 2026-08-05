import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CouponsService', () => {
  let service: CouponsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(() => {
    prisma = {
      coupon: { findFirst: jest.fn(), update: jest.fn() },
    };
    service = new CouponsService(prisma as unknown as PrismaService);
  });

  describe('validate', () => {
    const baseCoupon = {
      id: 'coupon-1',
      code: 'PROMO10',
      discountType: 'PERCENTAGE',
      value: 10,
      freeShipping: false,
      minOrderValue: null,
      validFrom: null,
      validUntil: null,
      usageLimit: null,
      usedCount: 0,
      isActive: true,
    };

    it('lança NotFoundException se o código não existir', async () => {
      prisma.coupon.findFirst.mockResolvedValue(null);
      await expect(service.validate('INEXISTENTE', 100)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita cupom inativo', async () => {
      prisma.coupon.findFirst.mockResolvedValue({ ...baseCoupon, isActive: false });
      await expect(service.validate('PROMO10', 100)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita cupom fora do período de validade', async () => {
      const future = new Date(Date.now() + 86_400_000);
      prisma.coupon.findFirst.mockResolvedValue({ ...baseCoupon, validFrom: future });
      await expect(service.validate('PROMO10', 100)).rejects.toBeInstanceOf(BadRequestException);

      const past = new Date(Date.now() - 86_400_000);
      prisma.coupon.findFirst.mockResolvedValue({ ...baseCoupon, validUntil: past });
      await expect(service.validate('PROMO10', 100)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita cupom que já atingiu o limite de uso', async () => {
      prisma.coupon.findFirst.mockResolvedValue({ ...baseCoupon, usageLimit: 5, usedCount: 5 });
      await expect(service.validate('PROMO10', 100)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita quando o subtotal não atinge o pedido mínimo', async () => {
      prisma.coupon.findFirst.mockResolvedValue({ ...baseCoupon, minOrderValue: 200 });
      await expect(service.validate('PROMO10', 100)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('calcula desconto percentual corretamente', async () => {
      prisma.coupon.findFirst.mockResolvedValue(baseCoupon); // 10%
      const result = await service.validate('PROMO10', 250);
      expect(result.discountAmount).toBe(25);
      expect(result.couponId).toBe('coupon-1');
    });

    it('calcula desconto fixo sem ultrapassar o subtotal (evita total negativo)', async () => {
      prisma.coupon.findFirst.mockResolvedValue({ ...baseCoupon, discountType: 'FIXED', value: 500 });
      const result = await service.validate('PROMO10', 100);
      expect(result.discountAmount).toBe(100); // limitado ao subtotal, não 500
    });
  });

  describe('incrementUsage', () => {
    it('incrementa usedCount via update dentro da tx recebida', async () => {
      const tx = { coupon: { update: jest.fn().mockResolvedValue({}) } };
      await service.incrementUsage(tx as never, 'coupon-1');
      expect(tx.coupon.update).toHaveBeenCalledWith({
        where: { id: 'coupon-1' },
        data: { usedCount: { increment: 1 } },
      });
    });
  });
});
