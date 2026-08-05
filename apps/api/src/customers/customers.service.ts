import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

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
      include: { addresses: { orderBy: { createdAt: 'asc' } } },
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

  private async assertExists(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }
}
