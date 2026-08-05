import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    const existing = await this.prisma.product.findFirst({ where: { sku: dto.sku } });
    if (existing) throw new ConflictException('Já existe um produto com este SKU');

    return this.prisma.product.create({ data: dto as Prisma.ProductUncheckedCreateInput });
  }

  async findAll(search?: string, categoryId?: string) {
    return this.prisma.product.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { barcode: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        stockItems: { include: { warehouse: true } },
      },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.assertExists(id);
    if (dto.sku) {
      const existing = await this.prisma.product.findFirst({ where: { sku: dto.sku, NOT: { id } } });
      if (existing) throw new ConflictException('Já existe um produto com este SKU');
    }
    return this.prisma.product.update({ where: { id }, data: dto as Prisma.ProductUncheckedUpdateInput });
  }

  async setActive(id: string, isActive: boolean) {
    await this.assertExists(id);
    return this.prisma.product.update({ where: { id }, data: { isActive } });
  }

  async lowStock() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      include: { stockItems: true },
    });
    return products
      .map(({ stockItems, ...product }) => ({
        ...product,
        totalQuantity: stockItems.reduce((sum, item) => sum + item.quantity, 0),
      }))
      .filter((product) => product.totalQuantity < product.minStock);
  }

  private async assertExists(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return product;
  }
}
