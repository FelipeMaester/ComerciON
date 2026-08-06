import { Injectable, NotFoundException } from '@nestjs/common';
import { ServiceOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SERVICE_ORDER_INCLUDE = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  vehicle: true,
  items: { include: { product: { select: { id: true, name: true, sku: true } } } },
  quote: { select: { id: true, createdAt: true } },
} as const;

@Injectable()
export class ServiceOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.serviceOrder.findMany({
      include: {
        customer: { select: { name: true } },
        vehicle: { select: { plate: true } },
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
    await this.assertExists(id);
    return this.prisma.serviceOrder.update({ where: { id }, data: { status }, include: SERVICE_ORDER_INCLUDE });
  }

  private async assertExists(id: string) {
    const serviceOrder = await this.prisma.serviceOrder.findUnique({ where: { id } });
    if (!serviceOrder) throw new NotFoundException('Ordem de serviço não encontrada');
    return serviceOrder;
  }
}
