import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialEntryType, Prisma, PurchaseEntryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../inventory/stock.service';
import { Paginated, PaginationQueryDto, paginated, toSkipTake } from '../common/pagination/pagination.dto';
import { dataDaConsulta } from '../common/data-da-consulta';
import { CreatePurchaseEntryDto } from './dto/create-purchase-entry.dto';

const ENTRY_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, sku: true, name: true } } } },
} as const;

interface ItemResolvido {
  productId: string;
  quantity: number;
  unitCost: number;
  total: number;
}

/**
 * Entrada de mercadoria: a nota do fornecedor chegando no estoque.
 *
 * Antes disto, dar entrada era UMA PEÇA POR VEZ pela tela do produto, com
 * tipo/quantidade/motivo. Uma nota com 40 itens eram 40 operações manuais — e
 * não sobrava registro de o que foi comprado, de quem, por quanto, nem quando.
 *
 * É também o lugar onde o custo muda. Comprou mais caro, o custo da peça sobe
 * aqui; a partir daí toda venda congela o custo novo no item (ver
 * SaleItem.unitCost), e a margem passa a refletir a compra nova sem reescrever
 * o que já foi vendido.
 */
@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
  ) {}

  async create(userId: string | undefined, dto: CreatePurchaseEntryDto) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) throw new NotFoundException('Depósito não encontrado');

    if (dto.supplierId) {
      const fornecedor = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!fornecedor) throw new NotFoundException('Fornecedor não encontrado');
    }

    // Todas as peças de uma vez: 40 itens não podem virar 40 idas ao banco só
    // para conferir existência.
    const ids = [...new Set(dto.items.map((i) => i.productId))];
    const pecas = await this.prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (pecas.length !== ids.length) {
      const achados = new Set(pecas.map((p) => p.id));
      throw new NotFoundException(`Peça não encontrada: ${ids.filter((id) => !achados.has(id)).join(', ')}`);
    }

    const itens: ItemResolvido[] = dto.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitCost: item.unitCost,
      total: Math.round(item.unitCost * item.quantity * 100) / 100,
    }));
    const total = Math.round(itens.reduce((soma, i) => soma + i.total, 0) * 100) / 100;

    if (dto.gerarContaAPagar && !dto.confirm) {
      throw new BadRequestException('A conta a pagar só nasce quando a entrada é confirmada.');
    }

    return this.prisma.$transaction(async (tx) => {
      const criada = await tx.purchaseEntry.create({
        data: {
          warehouseId: dto.warehouseId,
          supplierId: dto.supplierId,
          invoiceNumber: dto.invoiceNumber,
          receivedAt: dto.receivedAt ? dataDaConsulta(dto.receivedAt, 'receivedAt') : new Date(),
          notes: dto.notes,
          total,
          userId,
          status: dto.confirm ? PurchaseEntryStatus.CONFIRMED : PurchaseEntryStatus.DRAFT,
          confirmedAt: dto.confirm ? new Date() : null,
        } as Prisma.PurchaseEntryUncheckedCreateInput,
      });

      await tx.purchaseEntryItem.createMany({
        data: itens.map((i) => ({ ...i, entryId: criada.id })) as Prisma.PurchaseEntryItemUncheckedCreateInput[],
      });

      if (dto.confirm) {
        await this.aplicarEntrada(tx, userId, criada.id, itens, total, {
          warehouseId: dto.warehouseId,
          supplierId: dto.supplierId,
          invoiceNumber: dto.invoiceNumber,
          gerarContaAPagar: dto.gerarContaAPagar,
          dueDate: dto.dueDate,
        });
      }

      return tx.purchaseEntry.findUniqueOrThrow({ where: { id: criada.id }, include: ENTRY_INCLUDE });
    });
  }

  /**
   * Confirma uma entrada que estava em rascunho.
   *
   * Separado do create porque nota grande se digita aos poucos — e o estoque
   * não pode subir a cada linha digitada, senão o saldo fica errado durante
   * toda a digitação e quem vender no meio vende sobre número que não existe.
   */
  async confirm(userId: string | undefined, id: string, gerarContaAPagar = false, dueDate?: string) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.purchaseEntry.findUnique({ where: { id }, include: { items: true } });
      if (!entry) throw new NotFoundException('Entrada não encontrada');

      // A conferência vai DENTRO da transação, no próprio UPDATE: dois cliques
      // simultâneos em "confirmar" passariam os dois por uma verificação feita
      // em memória, e o estoque entraria duas vezes.
      const travada = await tx.purchaseEntry.updateMany({
        where: { id, status: PurchaseEntryStatus.DRAFT },
        data: { status: PurchaseEntryStatus.CONFIRMED, confirmedAt: new Date() },
      });
      if (travada.count === 0) {
        throw new BadRequestException(
          entry.status === PurchaseEntryStatus.CONFIRMED
            ? 'Esta entrada já foi confirmada — o estoque já subiu.'
            : 'Entrada cancelada não pode ser confirmada.',
        );
      }

      const itens: ItemResolvido[] = entry.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitCost: Number(i.unitCost),
        total: Number(i.total),
      }));

      await this.aplicarEntrada(tx, userId, id, itens, Number(entry.total), {
        warehouseId: entry.warehouseId,
        supplierId: entry.supplierId ?? undefined,
        invoiceNumber: entry.invoiceNumber ?? undefined,
        gerarContaAPagar,
        dueDate,
      });

      return tx.purchaseEntry.findUniqueOrThrow({ where: { id }, include: ENTRY_INCLUDE });
    });
  }

  /**
   * O efeito da entrada: estoque sobe, custo do cadastro é atualizado, e a
   * conta a pagar nasce se pedida.
   *
   * Tudo na MESMA transação de propósito. Estoque que entra sem o custo subir
   * deixa a margem errada em toda venda seguinte, e não há como perceber: os
   * dois números continuam plausíveis.
   */
  private async aplicarEntrada(
    tx: Prisma.TransactionClient,
    userId: string | undefined,
    entryId: string,
    itens: ItemResolvido[],
    total: number,
    dados: {
      warehouseId: string;
      supplierId?: string;
      invoiceNumber?: string;
      gerarContaAPagar?: boolean;
      dueDate?: string;
    },
  ) {
    for (const item of itens) {
      await this.stockService.performAdjust(tx, userId, {
        productId: item.productId,
        warehouseId: dados.warehouseId,
        type: 'IN',
        quantity: item.quantity,
        reason: `Entrada de mercadoria ${entryId}`,
      });

      // O custo do cadastro passa a ser o desta compra. É o número que a
      // próxima venda vai congelar no item.
      await tx.product.update({ where: { id: item.productId }, data: { costPrice: item.unitCost } });
    }

    if (dados.gerarContaAPagar) {
      const conta = await tx.financialEntry.create({
        data: {
          type: FinancialEntryType.PAYABLE,
          description: `Entrada de mercadoria${dados.invoiceNumber ? ` — nota ${dados.invoiceNumber}` : ''}`,
          category: 'Fornecedores',
          amount: total,
          dueDate: dados.dueDate ? dataDaConsulta(dados.dueDate, 'dueDate') : new Date(),
          supplierId: dados.supplierId,
        } as Prisma.FinancialEntryUncheckedCreateInput,
      });
      await tx.purchaseEntry.update({ where: { id: entryId }, data: { financialEntryId: conta.id } });
    }
  }

  async findAll(query: PaginationQueryDto): Promise<Paginated<unknown>> {
    const { skip, take, page, pageSize } = toSkipTake(query);
    const [items, total] = await Promise.all([
      this.prisma.purchaseEntry.findMany({
        include: ENTRY_INCLUDE,
        orderBy: { receivedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.purchaseEntry.count(),
    ]);
    return paginated(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const entry = await this.prisma.purchaseEntry.findUnique({ where: { id }, include: ENTRY_INCLUDE });
    if (!entry) throw new NotFoundException('Entrada não encontrada');
    return entry;
  }

  /**
   * Cancela uma entrada que ainda não subiu ao estoque.
   *
   * Entrada confirmada NÃO se cancela por aqui: as peças já estão na
   * prateleira e podem já ter sido vendidas. Desfazer significaria tirar do
   * estoque o que talvez não esteja mais lá — o caminho certo é uma saída
   * registrada, com motivo.
   */
  async cancel(id: string) {
    const cancelada = await this.prisma.purchaseEntry.updateMany({
      where: { id, status: PurchaseEntryStatus.DRAFT },
      data: { status: PurchaseEntryStatus.CANCELED },
    });
    if (cancelada.count === 0) {
      const entry = await this.prisma.purchaseEntry.findUnique({ where: { id } });
      if (!entry) throw new NotFoundException('Entrada não encontrada');
      throw new BadRequestException(
        entry.status === PurchaseEntryStatus.CONFIRMED
          ? 'Entrada confirmada não se cancela: as peças já entraram no estoque. Registre uma saída com o motivo.'
          : 'Esta entrada já está cancelada.',
      );
    }
    return this.findOne(id);
  }
}
