import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialEntryStatus, FinancialEntryType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinancialEntryDto } from './dto/create-financial-entry.dto';
import { exigirTransicao } from '../common/transicao-de-estado';
import { estaVencida, janelaAVencer } from '../common/vencimento';
import { Paginated, PaginationQueryDto, paginated, toSkipTake } from '../common/pagination/pagination.dto';

/** Os dois recortes que a tela do Financeiro oferece, e que o sino linka. */
export type RecorteDeVencimento = 'vencidas' | 'a-vencer';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFinancialEntryDto) {
    if (dto.type === FinancialEntryType.PAYABLE && dto.customerId) {
      throw new BadRequestException('Conta a pagar não deve ter customerId — use supplierId');
    }
    if (dto.type === FinancialEntryType.RECEIVABLE && dto.supplierId) {
      throw new BadRequestException('Conta a receber não deve ter supplierId — use customerId');
    }

    return this.prisma.financialEntry.create({
      data: { ...dto, dueDate: new Date(dto.dueDate) } as Prisma.FinancialEntryUncheckedCreateInput,
    });
  }

  /**
   * Lançamentos do financeiro — paginados, e com os dois recortes que a tela
   * oferece ("só vencidas" e "a vencer").
   *
   * Antes devolvia TUDO num array. Cada venda cria um recebível, então um ano
   * de loja são milhares: medido com 9.000 lançamentos, a resposta tinha 4 MB
   * e a tela renderizava as 9.000 linhas — 90 mil nós no DOM e 470 telas de
   * rolagem.
   *
   * Os dois recortes precisavam vir junto, e não depois: a tela os aplicava no
   * navegador, sobre o array inteiro. Paginar sem trazê-los para cá teria
   * trocado uma tela lenta por uma tela MENTIROSA — "só vencidas" mostraria as
   * vencidas da página, não as da loja.
   */
  async findAll(
    type?: FinancialEntryType,
    status?: FinancialEntryStatus,
    from?: Date,
    to?: Date,
    recorte?: RecorteDeVencimento,
    paginacao: PaginationQueryDto = {},
  ): Promise<Paginated<unknown>> {
    const { skip, take, page, pageSize } = toSkipTake(paginacao);
    const agora = new Date();

    // "Vencida" e "a vencer" são a MESMA regra do sino de avisos, importada
    // daqui em vez de reescrita: foi ter duas cópias que fez o sino dizer 12
    // e a tela abrir com 13.
    const janela = janelaAVencer(agora);
    const porRecorte: Prisma.FinancialEntryWhereInput =
      recorte === 'vencidas'
        ? { status: FinancialEntryStatus.PENDING, dueDate: { lt: janela.de } }
        : recorte === 'a-vencer'
          ? { status: FinancialEntryStatus.PENDING, dueDate: { gte: janela.de, lt: janela.ate } }
          : {};

    const where: Prisma.FinancialEntryWhereInput = {
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(from || to
        ? { dueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
      ...porRecorte,
    };

    const [entries, total] = await Promise.all([
      this.prisma.financialEntry.findMany({
        where,
        include: { customer: true, supplier: true, sale: true },
        orderBy: { dueDate: 'asc' },
        skip,
        take,
      }),
      this.prisma.financialEntry.count({ where }),
    ]);

    const itens = entries.map((entry) => ({
      ...entry,
      isOverdue: entry.status === FinancialEntryStatus.PENDING && estaVencida(entry.dueDate, agora),
    }));
    return paginated(itens, total, page, pageSize);
  }

  async findOne(id: string) {
    const entry = await this.prisma.financialEntry.findUnique({
      where: { id },
      include: { customer: true, supplier: true, sale: true },
    });
    if (!entry) throw new NotFoundException('Lançamento não encontrado');
    return entry;
  }

  async markPaid(id: string) {
    const entry = await this.assertExists(id);
    if (entry.status === FinancialEntryStatus.CANCELED) {
      throw new BadRequestException('Lançamento cancelado não pode ser marcado como pago');
    }
    // A condição vai dentro do UPDATE: sem ela, quatro cliques simultâneos em
    // "dar baixa" passavam os quatro pela conferência em memória.
    await exigirTransicao(
      this.prisma.financialEntry.updateMany({
        // Vencido também se paga — é o caso mais comum, aliás.
        where: { id, status: { in: [FinancialEntryStatus.PENDING, FinancialEntryStatus.OVERDUE] } },
        data: { status: 'PAID', paidAt: new Date() },
      }),
      'Este lançamento já está pago',
    );
    return this.prisma.financialEntry.findUniqueOrThrow({ where: { id } });
  }

  async cancel(id: string) {
    await this.assertExists(id);
    await exigirTransicao(
      this.prisma.financialEntry.updateMany({
        where: { id, status: { not: FinancialEntryStatus.PAID } },
        data: { status: 'CANCELED' },
      }),
      'Lançamento já pago não pode ser cancelado',
    );
    return this.prisma.financialEntry.findUniqueOrThrow({ where: { id } });
  }

  async cashFlow(from: Date, to: Date) {
    const entries = await this.prisma.financialEntry.findMany({
      where: {
        status: { not: FinancialEntryStatus.CANCELED },
        OR: [{ dueDate: { gte: from, lte: to } }, { paidAt: { gte: from, lte: to } }],
      },
    });

    const previsto = { receitas: 0, despesas: 0 };
    const realizado = { receitas: 0, despesas: 0 };

    for (const entry of entries) {
      const amount = Number(entry.amount);
      const isReceivable = entry.type === FinancialEntryType.RECEIVABLE;

      if (entry.dueDate >= from && entry.dueDate <= to) {
        if (isReceivable) previsto.receitas += amount;
        else previsto.despesas += amount;
      }
      if (entry.paidAt && entry.paidAt >= from && entry.paidAt <= to) {
        if (isReceivable) realizado.receitas += amount;
        else realizado.despesas += amount;
      }
    }

    return {
      from,
      to,
      previsto: {
        receitas: round2(previsto.receitas),
        despesas: round2(previsto.despesas),
        saldo: round2(previsto.receitas - previsto.despesas),
      },
      realizado: {
        receitas: round2(realizado.receitas),
        despesas: round2(realizado.despesas),
        saldo: round2(realizado.receitas - realizado.despesas),
      },
    };
  }

  private async assertExists(id: string) {
    const entry = await this.prisma.financialEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Lançamento não encontrado');
    return entry;
  }
}
