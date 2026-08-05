import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { LinkSupplierProductDto } from './dto/link-product.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSupplierDto) {
    if (dto.document) {
      const existing = await this.prisma.supplier.findFirst({ where: { document: dto.document } });
      if (existing) throw new ConflictException('Já existe um fornecedor com este documento');
    }
    return this.prisma.supplier.create({ data: dto as Prisma.SupplierUncheckedCreateInput });
  }

  async findAll(search?: string) {
    return this.prisma.supplier.findMany({
      where: search ? { name: { contains: search, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: { productLinks: { include: { product: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.assertExists(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async setActive(id: string, isActive: boolean) {
    await this.assertExists(id);
    return this.prisma.supplier.update({ where: { id }, data: { isActive } });
  }

  async linkProduct(supplierId: string, dto: LinkSupplierProductDto) {
    await this.assertExists(supplierId);
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Produto não encontrado');

    return this.prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId, productId: dto.productId } },
      create: {
        supplierId,
        productId: dto.productId,
        supplierSku: dto.supplierSku,
        cost: dto.cost,
        isPreferred: dto.isPreferred ?? false,
      } as Prisma.SupplierProductUncheckedCreateInput,
      update: {
        supplierSku: dto.supplierSku,
        cost: dto.cost,
        isPreferred: dto.isPreferred ?? false,
      },
    });
  }

  async unlinkProduct(supplierId: string, productId: string) {
    const link = await this.prisma.supplierProduct.findUnique({
      where: { supplierId_productId: { supplierId, productId } },
    });
    if (!link) throw new NotFoundException('Vínculo não encontrado');
    await this.prisma.supplierProduct.delete({ where: { id: link.id } });
  }

  private async assertExists(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');
    return supplier;
  }
}
