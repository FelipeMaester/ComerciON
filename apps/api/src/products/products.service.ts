import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Paginated, paginated, toSkipTake } from '../common/pagination/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const EQUIVALENT_SELECT = { id: true, name: true, sku: true, brand: true, price: true, vehicleApplication: true } as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    const existing = await this.prisma.product.findFirst({ where: { sku: dto.sku } });
    if (existing) throw new ConflictException('Já existe um produto com este SKU');

    return this.prisma.product.create({ data: dto as Prisma.ProductUncheckedCreateInput });
  }

  /**
   * Listagem paginada. Antes devolvia a tabela inteira, o que fazia o PDV
   * baixar todo o catálogo a cada abertura do caixa — numa loja com milhares
   * de SKUs, vários MB por vez, em conexão de loja de rua.
   */
  async findAll(query: QueryProductsDto): Promise<Paginated<unknown>> {
    const { search, categoryId, warehouseId } = query;
    const { skip, take, page, pageSize } = toSkipTake(query);

    const where: Prisma.ProductWhereInput = {
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
    };

    // A contagem roda em paralelo com a página: é o total que permite à tela
    // mostrar "1 de 12" em vez de só um "próxima" que às vezes vem vazio.
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
          // Traz o saldo junto para o PDV poder mostrar "3 em estoque" na
          // própria busca, sem uma segunda chamada por produto digitado.
          stockItems: {
            where: warehouseId ? { warehouseId } : undefined,
            select: { warehouseId: true, quantity: true },
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);

    const comSaldo = items.map(({ stockItems, ...product }) => ({
      ...product,
      totalQuantity: stockItems.reduce((soma, item) => soma + item.quantity, 0),
    }));

    return paginated(comSaldo, total, page, pageSize);
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

  /** Peças similares/equivalentes — relação simétrica; guardamos um único registro por par e consultamos os dois sentidos. */
  async listEquivalents(productId: string) {
    await this.assertExists(productId);
    const links = await this.prisma.productEquivalence.findMany({
      where: { OR: [{ productId }, { equivalentId: productId }] },
      include: { product: { select: EQUIVALENT_SELECT }, equivalent: { select: EQUIVALENT_SELECT } },
    });
    return links.map((link) => (link.productId === productId ? link.equivalent : link.product));
  }

  async addEquivalent(productId: string, equivalentId: string) {
    if (productId === equivalentId) {
      throw new BadRequestException('Um produto não pode ser equivalente a si mesmo');
    }
    await this.assertExists(productId);
    await this.assertExists(equivalentId);

    const existing = await this.prisma.productEquivalence.findFirst({
      where: {
        OR: [
          { productId, equivalentId },
          { productId: equivalentId, equivalentId: productId },
        ],
      },
    });
    if (existing) throw new ConflictException('Esses produtos já estão marcados como equivalentes');

    await this.prisma.productEquivalence.create({
      data: { productId, equivalentId } as Prisma.ProductEquivalenceUncheckedCreateInput,
    });
    return this.listEquivalents(productId);
  }

  async removeEquivalent(productId: string, equivalentId: string) {
    const link = await this.prisma.productEquivalence.findFirst({
      where: {
        OR: [
          { productId, equivalentId },
          { productId: equivalentId, equivalentId: productId },
        ],
      },
    });
    if (!link) throw new NotFoundException('Vínculo de equivalência não encontrado');
    await this.prisma.productEquivalence.delete({ where: { id: link.id } });
  }

  private async assertExists(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return product;
  }
}
