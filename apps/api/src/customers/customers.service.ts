import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateCustomerVehicleDto } from './dto/create-customer-vehicle.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

/** Maiúsculas, sem hífen/espaços — mesma placa não deve virar dois registros por causa de formatação. */
function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustomerDto) {
    if (dto.document) {
      const existing = await this.prisma.customer.findFirst({ where: { document: dto.document } });
      if (existing) throw new ConflictException('Já existe um cliente com este documento');
    }
    return this.prisma.customer.create({ data: dto as Prisma.CustomerUncheckedCreateInput });
  }

  async findAll(search?: string) {
    return this.prisma.customer.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        addresses: { orderBy: { createdAt: 'asc' } },
        vehicles: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.assertExists(id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async setActive(id: string, isActive: boolean) {
    await this.assertExists(id);
    return this.prisma.customer.update({ where: { id }, data: { isActive } });
  }

  async addAddress(customerId: string, dto: CreateCustomerAddressDto) {
    await this.assertExists(customerId);
    if (dto.isDefault) {
      await this.prisma.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    return this.prisma.customerAddress.create({
      data: { ...dto, customerId } as Prisma.CustomerAddressUncheckedCreateInput,
    });
  }

  async removeAddress(customerId: string, addressId: string) {
    const address = await this.prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!address || address.customerId !== customerId) {
      throw new NotFoundException('Endereço não encontrado');
    }
    await this.prisma.customerAddress.delete({ where: { id: addressId } });
  }

  async addVehicle(customerId: string, dto: CreateCustomerVehicleDto) {
    await this.assertExists(customerId);
    return this.prisma.customerVehicle.create({
      data: { ...dto, customerId, plate: normalizePlate(dto.plate) } as Prisma.CustomerVehicleUncheckedCreateInput,
    });
  }

  /**
   * Histórico do cliente: "Serviços" são os orçamentos (cada um já carrega a
   * ordem de serviço e a venda gerada, se houver — mesmo padrão do
   * QuotesService). "Compras" são vendas do cliente que não vieram de um
   * orçamento (PDV/loja), pra não listar a mesma venda duas vezes.
   */
  async getCustomerHistory(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    const [quotes, sales, pendingEntries, opportunities, tasks] = await Promise.all([
      this.prisma.quote.findMany({
        where: { customerId },
        include: {
          vehicle: { select: { id: true, plate: true } },
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          serviceOrder: {
            select: {
              id: true,
              status: true,
              scheduledAt: true,
              sale: { select: { id: true, status: true, total: true, payments: { select: { amount: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sale.findMany({
        where: { customerId, serviceOrder: null },
        include: { items: true, payments: true },
        orderBy: { createdAt: 'desc' },
      }),
      // Saldo em aberto (fiado): soma de todas as contas a receber pendentes
      // desse cliente, venham elas de serviço ou de venda direta.
      this.prisma.financialEntry.findMany({
        where: { customerId, type: 'RECEIVABLE', status: 'PENDING' },
        select: { amount: true, dueDate: true },
      }),
      this.prisma.opportunity.findMany({
        where: { customerId },
        include: { stage: { select: { id: true, name: true, isWonStage: true, isLostStage: true } }, responsible: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.task.findMany({
        where: { customerId },
        include: { assignedTo: { select: { id: true, name: true } } },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      }),
    ]);

    const now = new Date();
    const outstandingBalance = pendingEntries.reduce((sum, e) => sum + Number(e.amount), 0);
    const overdueBalance = pendingEntries
      .filter((e) => e.dueDate < now)
      .reduce((sum, e) => sum + Number(e.amount), 0);

    return {
      customer,
      quotes,
      sales,
      opportunities,
      tasks,
      outstandingBalance: Math.round(outstandingBalance * 100) / 100,
      overdueBalance: Math.round(overdueBalance * 100) / 100,
    };
  }

  /** Histórico do veículo: todos os orçamentos e ordens de serviço já feitos nele, mais recentes primeiro. */
  async getVehicleHistory(vehicleId: string) {
    const vehicle = await this.prisma.customerVehicle.findUnique({
      where: { id: vehicleId },
      include: {
        customer: { select: { id: true, name: true } },
        quotes: {
          include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
          orderBy: { createdAt: 'desc' },
        },
        serviceOrders: {
          include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado');
    return vehicle;
  }

  private async assertExists(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }
}
