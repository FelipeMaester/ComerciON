import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';

type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProduct(productId: string) {
    return this.prisma.stockItem.findMany({
      where: { productId },
      include: { warehouse: true },
      orderBy: { warehouse: { name: 'asc' } },
    });
  }

  async movements(productId: string) {
    return this.prisma.stockMovement.findMany({
      where: { productId },
      include: { warehouse: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async adjust(userId: string, dto: AdjustStockDto) {
    return this.prisma.$transaction((tx) => this.performAdjust(tx, userId, dto));
  }

  async transfer(userId: string, dto: TransferStockDto) {
    return this.prisma.$transaction((tx) => this.performTransfer(tx, userId, dto));
  }

  /**
   * Núcleo do ajuste de estoque, desacoplado de `$transaction` para poder ser
   * composto dentro de uma transação maior (ex.: confirmação de venda no PDV,
   * que precisa baixar vários itens + criar contas a receber atomicamente).
   */
  async performAdjust(tx: PrismaTx, userId: string | undefined, dto: AdjustStockDto) {
    await this.assertProductAndWarehouse(tx, dto.productId, dto.warehouseId);

    if (dto.type !== 'ADJUSTMENT' && dto.quantity < 1) {
      throw new BadRequestException('quantity deve ser maior que zero para IN/OUT/LOSS');
    }

    const stockItem = await tx.stockItem.upsert({
      where: { productId_warehouseId: { productId: dto.productId, warehouseId: dto.warehouseId } },
      create: { productId: dto.productId, warehouseId: dto.warehouseId, quantity: 0 } as Prisma.StockItemUncheckedCreateInput,
      update: {},
    });

    const newQuantity = this.computeNewQuantity(dto.type, stockItem.quantity, dto.quantity);

    await tx.stockItem.update({ where: { id: stockItem.id }, data: { quantity: newQuantity } });

    return tx.stockMovement.create({
      data: {
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        type: dto.type as StockMovementType,
        quantity: dto.quantity,
        previousQuantity: stockItem.quantity,
        newQuantity,
        reason: dto.reason,
        userId,
      } as Prisma.StockMovementUncheckedCreateInput,
    });
  }

  async performTransfer(tx: PrismaTx, userId: string, dto: TransferStockDto) {
    if (dto.sourceWarehouseId === dto.destWarehouseId) {
      throw new BadRequestException('Depósito de origem e destino devem ser diferentes');
    }
    await this.assertProductAndWarehouse(tx, dto.productId, dto.sourceWarehouseId);
    await this.assertProductAndWarehouse(tx, dto.productId, dto.destWarehouseId);

    const source = await tx.stockItem.upsert({
      where: { productId_warehouseId: { productId: dto.productId, warehouseId: dto.sourceWarehouseId } },
      create: { productId: dto.productId, warehouseId: dto.sourceWarehouseId, quantity: 0 } as Prisma.StockItemUncheckedCreateInput,
      update: {},
    });
    if (dto.quantity > source.quantity) {
      throw new BadRequestException('Quantidade insuficiente no depósito de origem');
    }
    const newSourceQuantity = source.quantity - dto.quantity;
    await tx.stockItem.update({ where: { id: source.id }, data: { quantity: newSourceQuantity } });
    await tx.stockMovement.create({
      data: {
        productId: dto.productId,
        warehouseId: dto.sourceWarehouseId,
        type: StockMovementType.TRANSFER,
        quantity: dto.quantity,
        previousQuantity: source.quantity,
        newQuantity: newSourceQuantity,
        reason: dto.reason ?? 'Transferência entre depósitos (saída)',
        userId,
      } as Prisma.StockMovementUncheckedCreateInput,
    });

    const dest = await tx.stockItem.upsert({
      where: { productId_warehouseId: { productId: dto.productId, warehouseId: dto.destWarehouseId } },
      create: { productId: dto.productId, warehouseId: dto.destWarehouseId, quantity: 0 } as Prisma.StockItemUncheckedCreateInput,
      update: {},
    });
    const newDestQuantity = dest.quantity + dto.quantity;
    await tx.stockItem.update({ where: { id: dest.id }, data: { quantity: newDestQuantity } });
    await tx.stockMovement.create({
      data: {
        productId: dto.productId,
        warehouseId: dto.destWarehouseId,
        type: StockMovementType.TRANSFER,
        quantity: dto.quantity,
        previousQuantity: dest.quantity,
        newQuantity: newDestQuantity,
        reason: dto.reason ?? 'Transferência entre depósitos (entrada)',
        userId,
      } as Prisma.StockMovementUncheckedCreateInput,
    });

    return { sourceQuantity: newSourceQuantity, destQuantity: newDestQuantity };
  }

  private computeNewQuantity(type: AdjustStockDto['type'], currentQuantity: number, quantity: number): number {
    switch (type) {
      case 'IN':
        return currentQuantity + quantity;
      case 'OUT':
      case 'LOSS':
        if (quantity > currentQuantity) {
          throw new BadRequestException('Quantidade insuficiente em estoque para esta saída');
        }
        return currentQuantity - quantity;
      case 'ADJUSTMENT':
        return quantity;
      default:
        throw new BadRequestException('Tipo de movimentação inválido');
    }
  }

  private async assertProductAndWarehouse(client: PrismaTx, productId: string, warehouseId: string) {
    const [product, warehouse] = await Promise.all([
      client.product.findUnique({ where: { id: productId } }),
      client.warehouse.findUnique({ where: { id: warehouseId } }),
    ]);
    if (!product) throw new NotFoundException('Produto não encontrado');
    if (!warehouse) throw new NotFoundException('Depósito não encontrado');
  }
}
