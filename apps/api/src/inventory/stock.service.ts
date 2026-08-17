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

    const stockItem = await this.garantirItemDeEstoque(tx, dto.productId, dto.warehouseId);
    const saldo = await this.aplicarVariacao(tx, stockItem, dto.type, dto.quantity);

    return tx.stockMovement.create({
      data: {
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        type: dto.type as StockMovementType,
        quantity: dto.quantity,
        previousQuantity: saldo.previousQuantity,
        newQuantity: saldo.newQuantity,
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

    const source = await this.garantirItemDeEstoque(tx, dto.productId, dto.sourceWarehouseId);
    const saida = await this.aplicarVariacao(tx, source, 'OUT', dto.quantity, 'Quantidade insuficiente no depósito de origem');
    await tx.stockMovement.create({
      data: {
        productId: dto.productId,
        warehouseId: dto.sourceWarehouseId,
        type: StockMovementType.TRANSFER,
        quantity: dto.quantity,
        previousQuantity: saida.previousQuantity,
        newQuantity: saida.newQuantity,
        reason: dto.reason ?? 'Transferência entre depósitos (saída)',
        userId,
      } as Prisma.StockMovementUncheckedCreateInput,
    });

    const dest = await this.garantirItemDeEstoque(tx, dto.productId, dto.destWarehouseId);
    const entrada = await this.aplicarVariacao(tx, dest, 'IN', dto.quantity);
    await tx.stockMovement.create({
      data: {
        productId: dto.productId,
        warehouseId: dto.destWarehouseId,
        type: StockMovementType.TRANSFER,
        quantity: dto.quantity,
        previousQuantity: entrada.previousQuantity,
        newQuantity: entrada.newQuantity,
        reason: dto.reason ?? 'Transferência entre depósitos (entrada)',
        userId,
      } as Prisma.StockMovementUncheckedCreateInput,
    });

    return { sourceQuantity: saida.newQuantity, destQuantity: entrada.newQuantity };
  }

  /**
   * Garante que a linha de saldo exista, sem corrida na criação.
   *
   * `upsert` do Prisma, com o tenantId que o middleware injeta no `where`,
   * cai no caminho "procura e depois cria" — duas requisições simultâneas
   * para um produto ainda sem saldo tentam inserir a mesma linha e uma leva
   * violação de chave única (que, dentro de uma transação, aborta tudo).
   * `createMany({ skipDuplicates })` vira `INSERT ... ON CONFLICT DO NOTHING`:
   * quem perde a corrida simplesmente não insere, e ninguém explode.
   */
  private async garantirItemDeEstoque(tx: PrismaTx, productId: string, warehouseId: string) {
    await tx.stockItem.createMany({
      data: [{ productId, warehouseId, quantity: 0 } as Prisma.StockItemCreateManyInput],
      skipDuplicates: true,
    });
    const item = await tx.stockItem.findFirst({ where: { productId, warehouseId } });
    if (!item) throw new NotFoundException('Item de estoque não encontrado');
    return item;
  }

  /**
   * Aplica a variação de saldo em UMA instrução SQL condicional, em vez de
   * ler em JavaScript, calcular e gravar de volta.
   *
   * O bug que isso corrige: no isolamento padrão do Postgres (Read Committed),
   * duas vendas simultâneas da última unidade liam as duas `quantity = 1`,
   * calculavam as duas `0` e gravavam as duas `0` — as duas passavam. Medido:
   * 5 vendas simultâneas de 1 unidade, 5 aceitas, estoque final 0.
   *
   * Com a condição dentro do próprio UPDATE (`WHERE quantity >= n`), a segunda
   * transação espera a trava de linha da primeira, reavalia a condição contra
   * o valor já comitado e afeta zero linhas — e é ela que recebe o erro de
   * quantidade insuficiente.
   *
   * O saldo devolvido é lido depois da gravação: como a trava de linha só sai
   * no commit, ninguém mais alterou a linha nesse meio-tempo, então o par
   * anterior/novo registrado na movimentação é o real, não o que o JavaScript
   * achava antes de gravar.
   */
  private async aplicarVariacao(
    tx: PrismaTx,
    item: { id: string; quantity: number },
    type: AdjustStockDto['type'],
    quantity: number,
    mensagemDeFalta = 'Quantidade insuficiente em estoque para esta saída',
  ): Promise<{ previousQuantity: number; newQuantity: number }> {
    switch (type) {
      case 'IN': {
        await this.exigirLinhaAfetada(tx.stockItem.updateMany({ where: { id: item.id }, data: { quantity: { increment: quantity } } }));
        const atual = await this.lerQuantidade(tx, item.id);
        return { previousQuantity: atual - quantity, newQuantity: atual };
      }
      case 'OUT':
      case 'LOSS': {
        const { count } = await tx.stockItem.updateMany({
          where: { id: item.id, quantity: { gte: quantity } },
          data: { quantity: { decrement: quantity } },
        });
        if (count === 0) throw new BadRequestException(mensagemDeFalta);
        const atual = await this.lerQuantidade(tx, item.id);
        return { previousQuantity: atual + quantity, newQuantity: atual };
      }
      case 'ADJUSTMENT': {
        // Contagem manual: o valor informado é absoluto, então aqui a última
        // gravação vence por definição — não há o que condicionar. O saldo
        // anterior vem da leitura do início da operação; é campo de auditoria,
        // não entra em nenhuma conta.
        await this.exigirLinhaAfetada(tx.stockItem.updateMany({ where: { id: item.id }, data: { quantity } }));
        return { previousQuantity: item.quantity, newQuantity: quantity };
      }
      default:
        throw new BadRequestException('Tipo de movimentação inválido');
    }
  }

  private async exigirLinhaAfetada(promessa: Promise<{ count: number }>) {
    const { count } = await promessa;
    if (count === 0) throw new NotFoundException('Item de estoque não encontrado');
  }

  private async lerQuantidade(tx: PrismaTx, id: string): Promise<number> {
    const item = await tx.stockItem.findFirst({ where: { id }, select: { quantity: true } });
    if (!item) throw new NotFoundException('Item de estoque não encontrado');
    return item.quantity;
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
