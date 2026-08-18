import { Injectable } from '@nestjs/common';
import { OpportunityStatus, PaymentMethod, Prisma, SaleStatus, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Oportunidade "parada": sem troca de etapa há mais de N dias — usado tanto
// no indicador do dashboard quanto no painel "Oportunidades encontradas".
const STALE_OPPORTUNITY_DAYS = 7;

// Janela do gráfico de faturamento do dashboard. Trinta dias mostram o mês
// corrente inteiro mais o fim do anterior, que é o que dá noção de tendência.
const SERIES_DAYS = 30;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return round2(((current - previous) / previous) * 100);
}

/**
 * Data no fuso do servidor, no formato AAAA-MM-DD.
 *
 * `toISOString().slice(0,10)` converteria para UTC e jogaria toda venda feita
 * depois das 21h no dia seguinte — no Brasil, um dia inteiro de faturamento
 * apareceria na coluna errada do gráfico.
 */
function diaLocalISO(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export interface PeriodStats {
  from: Date;
  to: Date;
  total: number;
  count: number;
  averageTicket: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  total: number;
}

export interface AbcCurveItem {
  productId: string;
  name: string;
  sku: string;
  revenue: number;
  cumulativePct: number;
  class: 'A' | 'B' | 'C';
}

/** Um ponto do gráfico de faturamento. `day` é a data local no formato ISO. */
export interface DailyPoint {
  day: string;
  total: number;
  count: number;
}

export interface PaymentSlice {
  method: PaymentMethod;
  total: number;
  count: number;
}

/**
 * Indicadores gerenciais (Fase 6). Tudo aqui é derivado de dados já
 * existentes (vendas confirmadas) — não depende de nenhuma integração
 * externa, ao contrário dos módulos fiscal/WhatsApp das fases anteriores.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const staleSince = new Date(now.getTime() - STALE_OPPORTUNITY_DAYS * 24 * 60 * 60 * 1000);

    // Mês anterior inteiro: é o que dá sentido ao número do mês corrente. "R$
    // 11 mil" sozinho não diz se o mês está bom.
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const yesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

    const [
      today,
      yesterdayStats,
      month,
      previousMonth,
      series,
      paymentMix,
      topProducts,
      abcCurve,
      goal,
      openOpportunities,
      staleOpportunitiesCount,
      staleOpportunities,
      overdueTasksCount,
      todayTasksCount,
      overdueTasks,
    ] = await Promise.all([
      this.periodStats(startOfToday, startOfTomorrow),
      this.periodStats(yesterday, startOfToday),
      this.periodStats(startOfMonth, startOfNextMonth),
      this.periodStats(startOfPreviousMonth, startOfMonth),
      this.getDailySeries(SERIES_DAYS),
      this.getPaymentMix(startOfMonth, startOfNextMonth),
      this.getTopProducts(startOfMonth, startOfNextMonth, 5),
      this.getAbcCurve(),
      this.prisma.salesGoal.findFirst({ where: { month: monthKey } }),
      this.prisma.opportunity.aggregate({
        where: { status: OpportunityStatus.OPEN },
        _count: true,
        _sum: { estimatedValue: true },
      }),
      this.prisma.opportunity.count({
        where: { status: OpportunityStatus.OPEN, stageChangedAt: { lt: staleSince } },
      }),
      this.getStaleOpportunities(5),
      this.prisma.task.count({ where: { status: TaskStatus.PENDING, dueDate: { lt: startOfToday } } }),
      this.prisma.task.count({ where: { status: TaskStatus.PENDING, dueDate: { gte: startOfToday, lt: startOfTomorrow } } }),
      this.getOverdueTasks(5),
    ]);

    const targetAmount = goal ? Number(goal.targetAmount) : null;

    return {
      today,
      month,
      series,
      paymentMix,
      // Variação contra o período equivalente anterior. `null` quando não há
      // com o que comparar (loja nova, primeiro mês) — melhor um traço do que
      // um "+100%" que não quer dizer nada.
      trend: {
        todayPct: pctChange(today.total, yesterdayStats.total),
        monthPct: pctChange(month.total, previousMonth.total),
        ticketPct: pctChange(month.averageTicket, previousMonth.averageTicket),
      },
      topProducts,
      abcCurve,
      goal: {
        month: monthKey,
        targetAmount,
        actualAmount: month.total,
        progressPct: targetAmount && targetAmount > 0 ? round2((month.total / targetAmount) * 100) : null,
      },
      pipeline: {
        openCount: openOpportunities._count,
        openValue: round2(Number(openOpportunities._sum.estimatedValue ?? 0)),
        staleCount: staleOpportunitiesCount,
        staleOpportunities,
      },
      tasks: {
        overdueCount: overdueTasksCount,
        todayCount: todayTasksCount,
        overdueTasks,
      },
    };
  }

  /** Oportunidades sem troca de etapa há mais de 7 dias — base do painel "Oportunidades encontradas". */
  async getStaleOpportunities(limit = 5) {
    const staleSince = new Date(Date.now() - STALE_OPPORTUNITY_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.opportunity.findMany({
      where: { status: OpportunityStatus.OPEN, stageChangedAt: { lt: staleSince } },
      include: { customer: { select: { id: true, name: true } }, stage: { select: { name: true } } },
      orderBy: { stageChangedAt: 'asc' },
      take: limit,
    });
  }

  /** Tarefas pendentes com vencimento no passado — base do painel de tarefas atrasadas. */
  async getOverdueTasks(limit = 5) {
    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
    return this.prisma.task.findMany({
      where: { status: TaskStatus.PENDING, dueDate: { lt: startOfToday } },
      include: { assignedTo: { select: { id: true, name: true } }, customer: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'asc' },
      take: limit,
    });
  }

  async comparePeriods(fromA: Date, toA: Date, fromB: Date, toB: Date) {
    const [periodA, periodB] = await Promise.all([this.periodStats(fromA, toA), this.periodStats(fromB, toB)]);
    return {
      periodA,
      periodB,
      revenueChangePct: pctChange(periodA.total, periodB.total),
      salesCountChangePct: pctChange(periodA.count, periodB.count),
    };
  }

  async setGoal(month: string, targetAmount: number) {
    const existing = await this.prisma.salesGoal.findFirst({ where: { month } });
    if (existing) {
      return this.prisma.salesGoal.update({ where: { id: existing.id }, data: { targetAmount } });
    }
    return this.prisma.salesGoal.create({
      data: { month, targetAmount } as Prisma.SalesGoalUncheckedCreateInput,
    });
  }

  async getGoal(month: string) {
    return this.prisma.salesGoal.findFirst({ where: { month } });
  }

  async periodStats(from: Date, to: Date): Promise<PeriodStats> {
    const agg = await this.prisma.sale.aggregate({
      where: { status: SaleStatus.CONFIRMED, confirmedAt: { gte: from, lt: to } },
      _sum: { total: true },
      _count: true,
    });
    const total = round2(Number(agg._sum.total ?? 0));
    const count = agg._count;
    return { from, to, total, count, averageTicket: count > 0 ? round2(total / count) : 0 };
  }

  /**
   * Faturamento dia a dia dos últimos N dias, para o gráfico do dashboard.
   *
   * Todo dia aparece, inclusive os sem venda nenhuma. Série com buraco mente
   * duas vezes: o gráfico liga o dia 3 no dia 7 como se a reta entre eles
   * fosse real, e a queda de um domingo parado desaparece.
   *
   * Os dias são agrupados em memória, e não com `date_trunc` no banco, porque
   * `$queryRaw` escapa do middleware que filtra por tenantId — uma loja veria
   * o movimento da outra. São duas colunas de um mês de vendas; cabe.
   */
  async getDailySeries(days = SERIES_DAYS): Promise<DailyPoint[]> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const from = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate() - (days - 1));
    const to = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    const sales = await this.prisma.sale.findMany({
      where: { status: SaleStatus.CONFIRMED, confirmedAt: { gte: from, lt: to } },
      select: { confirmedAt: true, total: true },
    });

    const buckets = new Map<string, { total: number; count: number }>();
    for (let i = 0; i < days; i++) {
      const dia = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
      buckets.set(diaLocalISO(dia), { total: 0, count: 0 });
    }

    for (const sale of sales) {
      if (!sale.confirmedAt) continue;
      const chave = diaLocalISO(sale.confirmedAt);
      const bucket = buckets.get(chave);
      if (!bucket) continue;
      bucket.total += Number(sale.total);
      bucket.count += 1;
    }

    return [...buckets.entries()].map(([day, { total, count }]) => ({ day, total: round2(total), count }));
  }

  /**
   * Quanto entrou por forma de pagamento no período — a rosca do dashboard.
   *
   * Sai do SalePayment, não do total da venda: uma venda paga metade no PIX e
   * metade no cartão precisa contar nos dois lugares.
   */
  async getPaymentMix(from: Date, to: Date): Promise<PaymentSlice[]> {
    const grouped = await this.prisma.salePayment.groupBy({
      by: ['method'],
      where: { sale: { status: SaleStatus.CONFIRMED, confirmedAt: { gte: from, lt: to } } },
      _sum: { amount: true },
      _count: true,
    });

    return grouped
      .map((g) => ({ method: g.method, total: round2(Number(g._sum.amount ?? 0)), count: g._count }))
      .sort((a, b) => b.total - a.total);
  }

  async getTopProducts(from: Date, to: Date, limit: number): Promise<TopProduct[]> {
    const grouped = await this.prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { status: SaleStatus.CONFIRMED, confirmedAt: { gte: from, lt: to } } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: limit,
    });
    // Itens sem produto (ex.: mão de obra) não entram no ranking de produtos.
    const productGroups = grouped.filter((g): g is typeof g & { productId: string } => g.productId !== null);
    if (productGroups.length === 0) return [];

    const products = await this.prisma.product.findMany({ where: { id: { in: productGroups.map((g) => g.productId) } } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    return productGroups.map((g) => {
      const product = productMap.get(g.productId);
      return {
        productId: g.productId,
        name: product?.name ?? 'Produto removido',
        sku: product?.sku ?? '—',
        quantity: g._sum.quantity ?? 0,
        total: round2(Number(g._sum.total ?? 0)),
      };
    });
  }

  /**
   * Curva ABC: classifica produtos ativos pelo faturamento acumulado
   * (histórico completo de vendas confirmadas). A: até 80% do faturamento
   * acumulado, B: até 95%, C: o restante (inclui produtos sem venda nenhuma
   * — útil para identificar itens parados).
   */
  async getAbcCurve(): Promise<AbcCurveItem[]> {
    const grouped = await this.prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { status: SaleStatus.CONFIRMED } },
      _sum: { total: true },
    });
    const revenueMap = new Map(grouped.map((g) => [g.productId, round2(Number(g._sum.total ?? 0))]));

    const products = await this.prisma.product.findMany({ where: { isActive: true } });
    const items = products
      .map((p) => ({ productId: p.id, name: p.name, sku: p.sku, revenue: revenueMap.get(p.id) ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = items.reduce((sum, i) => sum + i.revenue, 0);
    let cumulative = 0;

    return items.map((item) => {
      cumulative += item.revenue;
      const cumulativePct = totalRevenue > 0 ? round2((cumulative / totalRevenue) * 100) : 0;
      const abcClass: 'A' | 'B' | 'C' = totalRevenue === 0 ? 'C' : cumulativePct <= 80 ? 'A' : cumulativePct <= 95 ? 'B' : 'C';
      return { ...item, cumulativePct, class: abcClass };
    });
  }
}
