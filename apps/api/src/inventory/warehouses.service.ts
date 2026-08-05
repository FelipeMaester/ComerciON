import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWarehouseDto) {
    if (dto.isDefault) {
      await this.prisma.warehouse.updateMany({ data: { isDefault: false }, where: {} });
    }
    return this.prisma.warehouse.create({ data: dto as Prisma.WarehouseUncheckedCreateInput });
  }

  async findAll() {
    return this.prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    return this.assertExists(id);
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    await this.assertExists(id);
    if (dto.isDefault) {
      await this.prisma.warehouse.updateMany({ data: { isDefault: false }, where: {} });
    }
    return this.prisma.warehouse.update({ where: { id }, data: dto });
  }

  private async assertExists(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) throw new NotFoundException('Depósito não encontrado');
    return warehouse;
  }
}
