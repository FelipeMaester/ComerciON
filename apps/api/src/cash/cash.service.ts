import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CashMovementType,
  CashSession,
  CashSessionStatus,
  PaymentMethod,
  Prisma,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CashMovementDto, CloseCashSessionDto, OpenCashSessionDto } from './dto/cash.dto';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Como o dinheiro da gaveta é composto — é isto que a tela mostra ao vivo. */
export interface CashSummary {
  openingAmount: number;
  /** Só o que entrou EM DINHEIRO nas vendas desta sessão. */
  cashSales: number;
  /** Vendas da sessão pagas em cartão/pix/boleto — não estão na gaveta. */
  nonCashSales: number;
  deposits: number;
  withdrawals: number;
  /** Quanto o sistema espera encontrar na gaveta agora. */
  expectedAmount: number;
  salesCount: number;
}

/**
 * Caixa da frente de loja.
 *
 * A regra que define tudo aqui: **só dinheiro vivo entra na gaveta**. Venda no
 * cartão, pix ou fiado não muda o que a pessoa vai contar no fechamento. Por
 * isso o valor esperado soma apenas os SalePayment com method = CASH das
 * vendas confirmadas nesta sessão, mais suprimentos, menos sangrias.
 *
 * Uma venda devolvida sai da conta sozinha: `returnSale` muda o status para
 * RETURNED e o filtro aqui só considera CONFIRMED. Isso casa com o mundo
 * físico — o dinheiro saiu da gaveta na devolução, e o esperado cai junto.
 */
@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sessão aberta do operador, com o resumo ao vivo. Devolve null quando ele
   * não tem caixa aberto — é o que o PDV usa para avisar antes de vender.
   */
  async getCurrent(userId: string) {
    const session = await this.findOpenSession(userId);
    if (!session) return null;
    return this.withSummary(session);
  }

  async open(userId: string, dto: OpenCashSessionDto) {
    const existing = await this.findOpenSession(userId);
    if (existing) {
      throw new BadRequestException('Você já tem um caixa aberto. Feche o atual antes de abrir outro.');
    }

    const session = await this.prisma.cashSession.create({
      data: {
        operatorId: userId,
        openingAmount: new Prisma.Decimal(dto.openingAmount),
      } as Prisma.CashSessionUncheckedCreateInput,
    });

    return this.withSummary(session);
  }

  async addMovement(userId: string, dto: CashMovementDto) {
    const session = await this.requireOpenSession(userId);

    // Não dá para tirar da gaveta mais do que tem nela. Barrar aqui evita um
    // fechamento com saldo esperado negativo, que não significa nada.
    if (dto.type === CashMovementType.WITHDRAWAL) {
      const { expectedAmount } = await this.summarize(session);
      if (dto.amount > expectedAmount) {
        throw new BadRequestException(
          `A sangria (${dto.amount.toFixed(2)}) é maior que o dinheiro em caixa (${expectedAmount.toFixed(2)}).`,
        );
      }
    }

    await this.prisma.cashMovement.create({
      data: {
        sessionId: session.id,
        userId,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        reason: dto.reason,
      } as Prisma.CashMovementUncheckedCreateInput,
    });

    return this.withSummary(session);
  }

  /**
   * Fechamento com conferência. O operador informa o que contou; o sistema
   * compara com o esperado e registra os três valores. A tela pede a contagem
   * ANTES de mostrar o esperado (conferência às cegas) — se a pessoa vê o
   * número antes, ela digita esse número e a conferência não serve para nada.
   */
  async close(userId: string, dto: CloseCashSessionDto) {
    const session = await this.requireOpenSession(userId);
    const summary = await this.summarize(session);
    const difference = round2(dto.countedAmount - summary.expectedAmount);

    return this.prisma.cashSession.update({
      where: { id: session.id },
      data: {
        status: CashSessionStatus.CLOSED,
        countedAmount: new Prisma.Decimal(dto.countedAmount),
        expectedAmount: new Prisma.Decimal(summary.expectedAmount),
        difference: new Prisma.Decimal(difference),
        closingNotes: dto.closingNotes,
        closedAt: new Date(),
      },
    });
  }

  /** Histórico para quem administra — inclui as sessões dos outros operadores. */
  async findAll(limit = 30) {
    return this.prisma.cashSession.findMany({
      orderBy: { openedAt: 'desc' },
      take: limit,
      include: { operator: { select: { id: true, name: true } } },
    });
  }

  async findOne(id: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id },
      include: {
        operator: { select: { id: true, name: true } },
        movements: { orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true } } } },
      },
    });
    if (!session) throw new NotFoundException('Caixa não encontrado');

    // A composição (quanto foi dinheiro, quanto foi cartão, sangrias) é sempre
    // recalculada. O que ficou congelado no fechamento — countedAmount,
    // expectedAmount e difference — está no próprio registro e é o que vale
    // como conferência: se alguém alterar uma venda depois, a diferença
    // registrada na época continua sendo a que foi apurada.
    return { ...session, summary: await this.summarize(session) };
  }

  /**
   * Usado pelo SalesService na confirmação da venda: se o operador tem caixa
   * aberto, a venda é amarrada a ele. Sem isso o fechamento não teria como
   * saber quais vendas entraram naquela gaveta.
   */
  async findOpenSessionId(userId: string | undefined): Promise<string | null> {
    if (!userId) return null;
    const session = await this.findOpenSession(userId);
    return session?.id ?? null;
  }

  private findOpenSession(userId: string) {
    return this.prisma.cashSession.findFirst({
      where: { operatorId: userId, status: CashSessionStatus.OPEN },
    });
  }

  private async requireOpenSession(userId: string): Promise<CashSession> {
    const session = await this.findOpenSession(userId);
    if (!session) throw new BadRequestException('Nenhum caixa aberto. Abra o caixa antes de continuar.');
    return session;
  }

  private async withSummary(session: CashSession) {
    return { ...session, summary: await this.summarize(session) };
  }

  private async summarize(session: CashSession): Promise<CashSummary> {
    const [payments, movements, salesCount] = await Promise.all([
      this.prisma.salePayment.groupBy({
        by: ['method'],
        where: { sale: { cashSessionId: session.id, status: SaleStatus.CONFIRMED } },
        _sum: { amount: true },
      }),
      this.prisma.cashMovement.groupBy({
        by: ['type'],
        where: { sessionId: session.id },
        _sum: { amount: true },
      }),
      this.prisma.sale.count({ where: { cashSessionId: session.id, status: SaleStatus.CONFIRMED } }),
    ]);

    const sumBy = (rows: { _sum: { amount: Prisma.Decimal | null } }[]) =>
      round2(rows.reduce((total, r) => total + Number(r._sum.amount ?? 0), 0));

    const cashSales = sumBy(payments.filter((p) => p.method === PaymentMethod.CASH));
    const nonCashSales = sumBy(payments.filter((p) => p.method !== PaymentMethod.CASH));
    const deposits = sumBy(movements.filter((m) => m.type === CashMovementType.DEPOSIT));
    const withdrawals = sumBy(movements.filter((m) => m.type === CashMovementType.WITHDRAWAL));
    const openingAmount = Number(session.openingAmount);

    return {
      openingAmount,
      cashSales,
      nonCashSales,
      deposits,
      withdrawals,
      expectedAmount: round2(openingAmount + cashSales + deposits - withdrawals),
      salesCount,
    };
  }
}
