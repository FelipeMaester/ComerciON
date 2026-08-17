import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponDiscountType, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface CouponValidationResult {
  couponId: string;
  discountAmount: number;
  freeShipping: boolean;
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCouponDto) {
    const code = dto.code.toUpperCase();
    const existing = await this.prisma.coupon.findFirst({ where: { code } });
    if (existing) throw new ConflictException('Já existe um cupom com este código');

    return this.prisma.coupon.create({
      data: {
        code,
        discountType: dto.discountType,
        value: dto.value,
        freeShipping: dto.freeShipping ?? false,
        minOrderValue: dto.minOrderValue,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        usageLimit: dto.usageLimit,
      } as Prisma.CouponUncheckedCreateInput,
    });
  }

  async findAll() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Cupom não encontrado');
    return coupon;
  }

  async update(id: string, dto: UpdateCouponDto) {
    await this.findOne(id);
    if (dto.code) {
      const clash = await this.prisma.coupon.findFirst({ where: { code: dto.code.toUpperCase(), NOT: { id } } });
      if (clash) throw new ConflictException('Já existe um cupom com este código');
    }
    return this.prisma.coupon.update({
      where: { id },
      data: {
        ...dto,
        code: dto.code?.toUpperCase(),
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      },
    });
  }

  /**
   * Valida um código para um subtotal e devolve o desconto a aplicar.
   * Não incrementa o contador de uso — isso só deve acontecer depois que a
   * venda for de fato criada (ver incrementUsage), dentro da mesma transação.
   */
  async validate(code: string, subtotal: number): Promise<CouponValidationResult> {
    const coupon = await this.prisma.coupon.findFirst({ where: { code: code.toUpperCase() } });
    if (!coupon) throw new NotFoundException('Cupom não encontrado');
    if (!coupon.isActive) throw new BadRequestException('Este cupom está inativo');

    const now = new Date();
    if (coupon.validFrom && now < coupon.validFrom) throw new BadRequestException('Este cupom ainda não é válido');
    if (coupon.validUntil && now > coupon.validUntil) throw new BadRequestException('Este cupom expirou');
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Este cupom já atingiu o limite de uso');
    }
    if (coupon.minOrderValue && subtotal < Number(coupon.minOrderValue)) {
      throw new BadRequestException(`Pedido mínimo de R$ ${Number(coupon.minOrderValue).toFixed(2)} para usar este cupom`);
    }

    const discountAmount =
      coupon.discountType === CouponDiscountType.PERCENTAGE
        ? Math.round(((subtotal * Number(coupon.value)) / 100) * 100) / 100
        : Math.min(Number(coupon.value), subtotal);

    return { couponId: coupon.id, discountAmount, freeShipping: coupon.freeShipping };
  }

  /**
   * Consome uma unidade do cupom — e é AQUI que o limite de uso é imposto de
   * verdade, não no `validate`.
   *
   * O `validate` roda antes, com a venda ainda sendo montada, e sua conferência
   * fica velha no instante seguinte. Medido: seis vendas simultâneas com um
   * cupom de 50% e `usageLimit: 1` passaram as seis pela conferência e as seis
   * ganharam desconto — o contador terminou em 6 para um limite de 1.
   *
   * Com o limite dentro do `where`, o banco decrementa a "vaga" de forma
   * atômica: quem chega depois espera a trava de linha, reavalia
   * `usedCount < usageLimit` contra o valor já comitado e afeta zero linhas.
   * Como isso roda dentro da transação da venda, a venda inteira volta atrás.
   */
  async incrementUsage(tx: PrismaTx, couponId: string) {
    const { count } = await tx.coupon.updateMany({
      where: {
        id: couponId,
        // Cupom sem limite passa sempre; com limite, só enquanto houver vaga.
        OR: [{ usageLimit: null }, { usedCount: { lt: tx.coupon.fields.usageLimit } }],
      },
      data: { usedCount: { increment: 1 } },
    });
    if (count === 0) throw new BadRequestException('Este cupom já atingiu o limite de uso');
  }
}
