import { Injectable } from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return round2(((current - previous) / previous) * 100);
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

    const [today, month, topProducts, abcCurve, goal] = await Promise.all([
      this.periodStats(startOfToday, startOfTomorrow),
      this.periodStats(startOfMonth, startOfNextMonth),
      this.getTopProducts(startOfMonth, startOfNextMonth, 5),
      this.getAbcCurve(),
      this.prisma.salesGoal.findFirst({ where: { month: monthKey } }),
    ]);

    const targetAmount = goal ? Number(goal.targetAmount) : null;

    return {
      today,
      month,
      topProducts,
      abcCurve,
      goal: {
        month: monthKey,
        targetAmount,
        actualAmount: month.total,
        progressPct: targetAmount && targetAmount > 0 ? round2((month.total / targetAmount) * 100) : null,
      },
    };
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
