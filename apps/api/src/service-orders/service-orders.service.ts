import { Injectable, NotFoundException } from '@nestjs/common';
import { ServiceOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';

const SERVICE_ORDER_INCLUDE = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  vehicle: true,
  items: { include: { product: { select: { id: true, name: true, sku: true } } } },
  quote: { select: { id: true, createdAt: true } },
  sale: { select: { id: true, status: true } },
} as const;

@Injectable()
export class ServiceOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesService: SalesService,
  ) {}

  async findAll() {
    return this.prisma.serviceOrder.findMany({
      include: {
        customer: { select: { name: true } },
        vehicle: { select: { plate: true } },
        sale: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const serviceOrder = await this.prisma.serviceOrder.findUnique({ where: { id }, include: SERVICE_ORDER_INCLUDE });
    if (!serviceOrder) throw new NotFoundException('Ordem de serviço não encontrada');
    return serviceOrder;
  }

  async updateStatus(id: string, status: ServiceOrderStatus) {
    const serviceOrder = await this.prisma.serviceOrder.findUnique({ where: { id }, include: { items: true } });
    if (!serviceOrder) throw new NotFoundException('Ordem de serviço não encontrada');

    // Ao concluir, gera automaticamente a venda correspondente (confirmada,
    // mas sem pagamento — fica pendente no Financeiro). Só na primeira vez
    // que a ordem chega a DONE: o saleId guarda essa garantia mesmo que o
    // status volte e avance de novo depois.
    if (status === ServiceOrderStatus.DONE && !serviceOrder.saleId) {
      const sale = await this.salesService.createFromServiceOrder(serviceOrder);
      await this.prisma.serviceOrder.update({ where: { id }, data: { saleId: sale.id } });
    }

    return this.prisma.serviceOrder.update({ where: { id }, data: { status }, include: SERVICE_ORDER_INCLUDE });
  }

  async schedule(id: string, scheduledAt: string | undefined) {
    const serviceOrder = await this.prisma.serviceOrder.findUnique({ where: { id } });
    if (!serviceOrder) throw new NotFoundException('Ordem de serviço não encontrada');

    return this.prisma.serviceOrder.update({
      where: { id },
      data: { scheduledAt: scheduledAt ? new Date(scheduledAt) : null },
      include: SERVICE_ORDER_INCLUDE,
    });
  }
}
