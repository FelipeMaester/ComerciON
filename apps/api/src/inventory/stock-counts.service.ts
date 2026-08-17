import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockCountStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from './stock.service';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { exigirTransicao } from '../common/transicao-de-estado';

const STOCK_COUNT_INCLUDE = {
  warehouse: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true, barcode: true } } } },
} as const;

@Injectable()
export class StockCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
  ) {}

  /** Abre uma contagem: tira uma foto da quantidade que o sistema tem agora — a contagem física é comparada contra esse snapshot, não contra o estoque "ao vivo". */
  async create(userId: string, dto: CreateStockCountDto) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) throw new NotFoundException('Depósito não encontrado');

    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        ...(dto.productIds?.length ? { id: { in: dto.productIds } } : {}),
      },
      include: { stockItems: { where: { warehouseId: dto.warehouseId } } },
    });
    if (products.length === 0) throw new BadRequestException('Nenhum produto encontrado para contar');

    return this.prisma.$transaction(async (tx) => {
      const stockCount = await tx.stockCount.create({
        data: { warehouseId: dto.warehouseId, userId, notes: dto.notes } as Prisma.StockCountUncheckedCreateInput,
      });

      await tx.stockCountItem.createMany({
        data: products.map((product) => ({
          stockCountId: stockCount.id,
          productId: product.id,
          expectedQty: product.stockItems[0]?.quantity ?? 0,
        })) as Prisma.StockCountItemUncheckedCreateInput[],
      });

      return tx.stockCount.findUniqueOrThrow({ where: { id: stockCount.id }, include: STOCK_COUNT_INCLUDE });
    });
  }

  async findAll() {
    return this.prisma.stockCount.findMany({
      include: { warehouse: { select: { name: true } }, items: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const stockCount = await this.prisma.stockCount.findUnique({ where: { id }, include: STOCK_COUNT_INCLUDE });
    if (!stockCount) throw new NotFoundException('Contagem de estoque não encontrada');
    return stockCount;
  }

  async setCountedQty(stockCountId: string, itemId: string, countedQty: number) {
    const stockCount = await this.assertOpen(stockCountId);
    const item = stockCount.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Item da contagem não encontrado');

    await this.prisma.stockCountItem.update({ where: { id: itemId }, data: { countedQty } });
    return this.findOne(stockCountId);
  }

  /** Aplica as divergências como ajuste de estoque (tipo ADJUSTMENT — countedQty vira a quantidade nova, não um delta) e fecha a contagem. */
  async complete(id: string, userId: string) {
    const stockCount = await this.assertOpen(id);

    return this.prisma.$transaction(async (tx) => {
      // Fecha a contagem ANTES de aplicar os ajustes. Sem isto, quatro
      // finalizações simultâneas passavam todas pela conferência e lançavam
      // quatro ajustes: o saldo ficava certo (ADJUSTMENT é valor absoluto),
      // mas o histórico mostrava correções que nunca aconteceram — e é o
      // histórico que o dono da loja usa para entender uma diferença.
      await exigirTransicao(
        tx.stockCount.updateMany({
          where: { id, status: StockCountStatus.OPEN },
          data: { status: StockCountStatus.COMPLETED, completedAt: new Date() },
        }),
        'Esta contagem já foi finalizada ou cancelada',
      );

      for (const item of stockCount.items) {
        if (item.countedQty === null || item.countedQty === item.expectedQty) continue;
        // eslint-disable-next-line no-await-in-loop
        await this.stockService.performAdjust(tx, userId, {
          productId: item.productId,
          warehouseId: stockCount.warehouseId,
          type: 'ADJUSTMENT',
          quantity: item.countedQty,
          reason: `Contagem de estoque ${stockCount.id}`,
        });
      }

      return tx.stockCount.findUniqueOrThrow({ where: { id }, include: STOCK_COUNT_INCLUDE });
    });
  }

  async cancel(id: string) {
    await this.assertOpen(id);
    // Condição no UPDATE: cancelar e finalizar ao mesmo tempo não pode deixar
    // a contagem cancelada com os ajustes já aplicados no estoque.
    await exigirTransicao(
      this.prisma.stockCount.updateMany({
        where: { id, status: StockCountStatus.OPEN },
        data: { status: StockCountStatus.CANCELED },
      }),
      'Esta contagem já foi finalizada ou cancelada',
    );
    return this.prisma.stockCount.findUniqueOrThrow({ where: { id } });
  }

  private async assertOpen(id: string) {
    const stockCount = await this.prisma.stockCount.findUnique({ where: { id }, include: STOCK_COUNT_INCLUDE });
    if (!stockCount) throw new NotFoundException('Contagem de estoque não encontrada');
    if (stockCount.status !== StockCountStatus.OPEN) {
      throw new BadRequestException('Esta contagem já foi finalizada ou cancelada');
    }
    return stockCount;
  }
}
