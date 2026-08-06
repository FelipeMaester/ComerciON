import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuoteStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';

const QUOTE_INCLUDE = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  vehicle: true,
  items: { include: { product: { select: { id: true, name: true, sku: true } } } },
  serviceOrder: { select: { id: true, status: true } },
} as const;

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateQuoteDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    if (dto.vehicleId) {
      const vehicle = await this.prisma.customerVehicle.findUnique({ where: { id: dto.vehicleId } });
      if (!vehicle || vehicle.customerId !== dto.customerId) {
        throw new BadRequestException('Veículo não pertence a este cliente');
      }
    }

    const total = dto.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.create({
        data: {
          customerId: dto.customerId,
          vehicleId: dto.vehicleId,
          description: dto.description,
          total,
        } as Prisma.QuoteUncheckedCreateInput,
      });

      await tx.quoteItem.createMany({
        data: dto.items.map((item) => ({
          quoteId: quote.id,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })) as Prisma.QuoteItemUncheckedCreateInput[],
      });

      return tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: QUOTE_INCLUDE });
    });
  }

  async findAll() {
    return this.prisma.quote.findMany({
      include: {
        customer: { select: { name: true } },
        vehicle: { select: { plate: true } },
        serviceOrder: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const quote = await this.prisma.quote.findUnique({ where: { id }, include: QUOTE_INCLUDE });
    if (!quote) throw new NotFoundException('Orçamento não encontrado');
    return quote;
  }

  /** Rota pública (link enviado ao cliente) — resolvido pelo publicToken, não exige login. */
  async findByPublicToken(token: string) {
    const quote = await this.prisma.quote.findUnique({ where: { publicToken: token }, include: QUOTE_INCLUDE });
    if (!quote) throw new NotFoundException('Orçamento não encontrado');
    return quote;
  }

  async approveByToken(token: string) {
    const quote = await this.prisma.quote.findUnique({ where: { publicToken: token }, include: { items: true } });
    if (!quote) throw new NotFoundException('Orçamento não encontrado');
    if (quote.status !== QuoteStatus.PENDING) {
      throw new BadRequestException('Este orçamento já foi respondido');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id: quote.id },
        data: { status: QuoteStatus.APPROVED, approvedAt: new Date() },
      });

      // tenantId explícito: essa rota é pública (sem token JWT, sem contexto
      // ambiente garantido), então não dá pra confiar só na injeção
      // automática do middleware — usamos o tenant do próprio orçamento.
      const serviceOrder = await tx.serviceOrder.create({
        data: {
          tenantId: quote.tenantId,
          quoteId: quote.id,
          customerId: quote.customerId,
          vehicleId: quote.vehicleId,
          description: quote.description,
          total: quote.total,
        } as Prisma.ServiceOrderUncheckedCreateInput,
      });

      await tx.serviceOrderItem.createMany({
        data: quote.items.map((item) => ({
          tenantId: quote.tenantId,
          serviceOrderId: serviceOrder.id,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })) as Prisma.ServiceOrderItemUncheckedCreateInput[],
      });

      return tx.serviceOrder.findUniqueOrThrow({
        where: { id: serviceOrder.id },
        include: { items: true },
      });
    });
  }

  async rejectByToken(token: string) {
    const quote = await this.prisma.quote.findUnique({ where: { publicToken: token } });
    if (!quote) throw new NotFoundException('Orçamento não encontrado');
    if (quote.status !== QuoteStatus.PENDING) {
      throw new BadRequestException('Este orçamento já foi respondido');
    }
    return this.prisma.quote.update({
      where: { id: quote.id },
      data: { status: QuoteStatus.REJECTED, rejectedAt: new Date() },
    });
  }
}
