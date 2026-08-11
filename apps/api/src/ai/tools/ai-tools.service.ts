import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardService } from '../../reports/dashboard.service';
import { LLMToolDefinition } from '../llm/llm-provider.interface';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Registro de functions seguras que a ComerciON IA pode chamar. Cada uma já
 * roda escopada pelo tenant através do middleware do Prisma de sempre
 * (ver src/prisma/prisma.service.ts) — nenhuma delas recebe ou usa um
 * tenantId vindo do modelo de linguagem. Só leitura nesta fase: nenhuma
 * altera dados (isso fica pra quando existir um fluxo de confirmação
 * explícita, ver plano da Fase B).
 */
@Injectable()
export class AiToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
  ) {}

  getDefinitions(): LLMToolDefinition[] {
    return [
      {
        name: 'getSalesSummary',
        description: 'Resumo de vendas de hoje e do mês, produtos mais vendidos, curva ABC e progresso da meta do mês.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'getStaleOpportunities',
        description: 'Oportunidades abertas no pipeline sem troca de etapa há mais de 7 dias.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'getOpenQuotes',
        description: 'Orçamentos aguardando aprovação do cliente (status PENDING), mais recentes primeiro.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'getCustomersWithoutRecentPurchase',
        description: 'Clientes ativos sem nenhuma venda confirmada nos últimos N dias (útil pra campanhas de reativação).',
        parameters: {
          type: 'object',
          properties: { days: { type: 'number', description: 'Janela em dias, padrão 90' } },
        },
      },
      {
        name: 'getSellerPerformance',
        description: 'Total vendido e quantidade de vendas confirmadas por vendedor no mês corrente.',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'getOverdueTasks',
        description: 'Tarefas de follow-up pendentes com vencimento no passado, com o responsável e o cliente vinculado (se houver).',
        parameters: { type: 'object', properties: {} },
      },
    ];
  }

  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'getSalesSummary':
        return this.dashboard.getSummary();
      case 'getStaleOpportunities':
        return this.dashboard.getStaleOpportunities();
      case 'getOpenQuotes':
        return this.getOpenQuotes();
      case 'getCustomersWithoutRecentPurchase':
        return this.getCustomersWithoutRecentPurchase(typeof args.days === 'number' ? args.days : 90);
      case 'getSellerPerformance':
        return this.getSellerPerformance();
      case 'getOverdueTasks':
        return this.dashboard.getOverdueTasks(20);
      default:
        throw new BadRequestException(`Tool desconhecida: ${name}`);
    }
  }

  private async getOpenQuotes() {
    const quotes = await this.prisma.quote.findMany({
      where: { status: 'PENDING' },
      select: { id: true, total: true, createdAt: true, customer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return quotes.map((q) => ({
      id: q.id,
      customerName: q.customer.name,
      total: Number(q.total),
      createdAt: q.createdAt,
    }));
  }

  private async getCustomersWithoutRecentPurchase(days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recentSales = await this.prisma.sale.findMany({
      where: { status: 'CONFIRMED', confirmedAt: { gte: cutoff }, customerId: { not: null } },
      select: { customerId: true },
      distinct: ['customerId'],
    });
    const recentIds = recentSales.map((s) => s.customerId as string);

    const customers = await this.prisma.customer.findMany({
      where: { isActive: true, id: { notIn: recentIds } },
      select: { id: true, name: true, phone: true, email: true },
      take: 30,
    });
    return { days, count: customers.length, customers };
  }

  private async getSellerPerformance() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const grouped = await this.prisma.sale.groupBy({
      by: ['sellerId'],
      where: { status: 'CONFIRMED', confirmedAt: { gte: startOfMonth }, sellerId: { not: null } },
      _sum: { total: true },
      _count: true,
    });
    if (grouped.length === 0) return [];

    const sellers = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.sellerId as string) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(sellers.map((s) => [s.id, s.name]));

    return grouped
      .map((g) => ({
        sellerId: g.sellerId,
        name: nameById.get(g.sellerId as string) ?? 'Vendedor removido',
        salesCount: g._count,
        total: round2(Number(g._sum.total ?? 0)),
      }))
      .sort((a, b) => b.total - a.total);
  }
}
