import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockCountStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from './stock.service';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { QueryStockCountItemsDto } from './dto/query-stock-count-items.dto';
import { exigirTransicao } from '../common/transicao-de-estado';
import { PaginationQueryDto, paginated, toSkipTake } from '../common/pagination/pagination.dto';

/**
 * A ficha da contagem SEM os itens.
 *
 * Os itens saíram daqui de propósito. Uma contagem da loja inteira tem um item
 * por peça do catálogo — 4.000 numa loja média —, e devolver todos junto com o
 * cabeçalho fazia cada resposta desta rota pesar 1,4 MB. Quem conta o
 * inventário anda pela loja com o tablet no wi-fi do galpão; os itens vêm
 * paginados por findItems, na medida em que a pessoa avança.
 */
const FICHA_DA_CONTAGEM = {
  warehouse: { select: { id: true, name: true } },
} as const;

const ITEM_INCLUDE = {
  product: { select: { id: true, name: true, sku: true, barcode: true } },
} as const;

/**
 * Quanto tempo dar à transação que fecha a contagem.
 *
 * Os 5 segundos padrão do Prisma são um número genérico para transação
 * interativa, não uma afirmação sobre esta operação: aqui o trabalho é
 * proporcional às divergências, porque cada uma vira um ajuste de estoque com
 * seu registro no histórico. Medido na loja de 4.000 peças: 501 divergências
 * fecharam em 2,7s, ~5,4 ms cada. No padrão, uma contagem com mais de ~900
 * divergências estouraria e faria tudo voltar atrás — e o pior é QUANDO isso
 * acontece: depois de horas percorrendo o galpão, no clique final, sem jeito
 * de terminar por mais que se tente.
 *
 * Fatiar em várias transações resolveria o tempo e criaria coisa pior: metade
 * dos ajustes aplicados numa contagem que continua aberta. O fechamento é
 * atômico por necessidade, então o que se ajusta é o tempo.
 *
 * 40 ms por peça dá umas sete vezes a folga do medido; o mínimo cobre a
 * contagem pequena, e o teto existe para que uma consulta travada no banco não
 * segure a transação (e os bloqueios nas peças) por tempo indeterminado.
 */
export function tempoParaAjustar(divergencias: number): number {
  const MINIMO = 15_000;
  const TETO = 300_000;
  return Math.min(TETO, Math.max(MINIMO, divergencias * 40));
}

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

    const id = await this.prisma.$transaction(async (tx) => {
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

      return stockCount.id;
    });

    return this.findOne(id);
  }

  async findAll(query: PaginationQueryDto) {
    const { skip, take, page, pageSize } = toSkipTake(query);
    const [contagens, total] = await Promise.all([
      this.prisma.stockCount.findMany({
        // _count no lugar de trazer os itens: a tela mostra "4.000 itens", e
        // carregar 4.000 linhas por contagem para exibir o número delas fazia
        // esta listagem pesar 184 KB com uma única contagem aberta.
        include: { ...FICHA_DA_CONTAGEM, _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.stockCount.count(),
    ]);
    return paginated(contagens, total, page, pageSize);
  }

  async findOne(id: string) {
    const stockCount = await this.prisma.stockCount.findUnique({ where: { id }, include: FICHA_DA_CONTAGEM });
    if (!stockCount) throw new NotFoundException('Contagem de estoque não encontrada');
    return { ...stockCount, resumo: await this.resumo(id) };
  }

  /** Os itens da contagem, aos poucos e filtrados pelo que a pessoa está procurando. */
  async findItems(id: string, query: QueryStockCountItemsDto) {
    await this.exigirContagem(id);
    const { skip, take, page, pageSize } = toSkipTake(query);

    const busca = query.search?.trim();
    const onde: Prisma.StockCountItemWhereInput = {
      stockCountId: id,
      ...(query.situacao === 'PENDENTES' ? { countedQty: null } : {}),
      ...(query.situacao === 'DIVERGENTES' ? this.filtroDeDivergencia() : {}),
      ...(busca
        ? {
            product: {
              OR: [
                { name: { contains: busca, mode: 'insensitive' } },
                { sku: { contains: busca, mode: 'insensitive' } },
                { barcode: { contains: busca, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.stockCountItem.findMany({
        where: onde,
        include: ITEM_INCLUDE,
        // Ordem fixa e previsível: sem ela, a página 2 pode repetir uma peça da
        // página 1 e pular outra, e quem está contando não tem como perceber.
        orderBy: [{ product: { name: 'asc' } }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.stockCountItem.count({ where: onde }),
    ]);
    return paginated(items, total, page, pageSize);
  }

  async setCountedQty(stockCountId: string, itemId: string, countedQty: number) {
    const stockCount = await this.exigirAberta(stockCountId);

    // updateMany com o stockCountId no where: confirma que o item é desta
    // contagem sem precisar carregar os 4.000 itens dela só para procurar um.
    const alterados = await this.prisma.stockCountItem.updateMany({
      where: { id: itemId, stockCountId: stockCount.id },
      data: { countedQty },
    });
    if (alterados.count === 0) throw new NotFoundException('Item da contagem não encontrado');

    // Devolve a peça salva e os totais — não a contagem inteira. Era isto que
    // fazia CADA "Salvar" trafegar 1,4 MB: contar a loja toda eram 4.000
    // salvamentos, quase 6 GB, e a tabela de 4.000 linhas redesenhada a cada
    // um. Os totais vêm junto porque o cabeçalho ("faltam 3.998") tem de
    // continuar verdadeiro sem recarregar a tela.
    const [item, resumo] = await Promise.all([
      this.prisma.stockCountItem.findUniqueOrThrow({ where: { id: itemId }, include: ITEM_INCLUDE }),
      this.resumo(stockCountId),
    ]);
    return { item, resumo };
  }

  /** Aplica as divergências como ajuste de estoque (tipo ADJUSTMENT — countedQty vira a quantidade nova, não um delta) e fecha a contagem. */
  async complete(id: string, userId: string) {
    const stockCount = await this.exigirAberta(id);
    // Só os itens que geram ajuste. Antes o método carregava os 4.000 itens da
    // contagem para descartar quase todos no `continue` do laço.
    const divergentes = await this.prisma.stockCountItem.findMany({
      where: { stockCountId: id, ...this.filtroDeDivergencia() },
      select: { productId: true, countedQty: true },
    });

    await this.prisma.$transaction(
      async (tx) => {
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

        for (const item of divergentes) {
          // eslint-disable-next-line no-await-in-loop
          await this.stockService.performAdjust(tx, userId, {
            productId: item.productId,
            warehouseId: stockCount.warehouseId,
            type: 'ADJUSTMENT',
            quantity: item.countedQty as number,
            reason: `Contagem de estoque ${id}`,
          });
        }
      },
      { timeout: tempoParaAjustar(divergentes.length) },
    );

    return this.findOne(id);
  }

  async cancel(id: string) {
    await this.exigirAberta(id);
    // Condição no UPDATE: cancelar e finalizar ao mesmo tempo não pode deixar
    // a contagem cancelada com os ajustes já aplicados no estoque.
    await exigirTransicao(
      this.prisma.stockCount.updateMany({
        where: { id, status: StockCountStatus.OPEN },
        data: { status: StockCountStatus.CANCELED },
      }),
      'Esta contagem já foi finalizada ou cancelada',
    );
    return this.findOne(id);
  }

  /**
   * Item contado com quantidade diferente da esperada.
   *
   * Comparar duas colunas da mesma linha é `fields` do Prisma, não SQL cru: o
   * middleware que carimba o tenantId não alcança consulta crua, e uma
   * contagem de outra loja entraria na conta sem ninguém notar.
   */
  private filtroDeDivergencia(): Prisma.StockCountItemWhereInput {
    return {
      countedQty: { not: null },
      NOT: { countedQty: { equals: this.prisma.stockCountItem.fields.expectedQty } },
    };
  }

  /** Os três números do cabeçalho, contados no banco. */
  private async resumo(id: string) {
    const [total, contados, divergentes] = await Promise.all([
      this.prisma.stockCountItem.count({ where: { stockCountId: id } }),
      this.prisma.stockCountItem.count({ where: { stockCountId: id, countedQty: { not: null } } }),
      this.prisma.stockCountItem.count({ where: { stockCountId: id, ...this.filtroDeDivergencia() } }),
    ]);
    return { total, contados, pendentes: total - contados, divergentes };
  }

  private async exigirContagem(id: string) {
    const stockCount = await this.prisma.stockCount.findUnique({ where: { id } });
    if (!stockCount) throw new NotFoundException('Contagem de estoque não encontrada');
    return stockCount;
  }

  private async exigirAberta(id: string) {
    const stockCount = await this.exigirContagem(id);
    if (stockCount.status !== StockCountStatus.OPEN) {
      throw new BadRequestException('Esta contagem já foi finalizada ou cancelada');
    }
    return stockCount;
  }
}
