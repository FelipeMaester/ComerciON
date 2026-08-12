import { Injectable } from '@nestjs/common';
import {
  AutomationAction,
  AutomationSuggestionStatus,
  AutomationTrigger,
  FinancialEntryStatus,
  FinancialEntryType,
  OpportunityStatus,
  QuoteStatus,
  SaleStatus,
  ServiceOrderStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Números agregados do negócio. É daqui que sai TODA sugestão de automação —
 * tanto no motor de regras quanto no de IA. Só contagens e somas: nenhum
 * nome, telefone, documento ou registro individual de cliente.
 */
export interface BusinessSignals {
  pendingQuotesOver3Days: number;
  pendingQuotesValue: number;
  staleOpportunitiesOver7Days: number;
  overdueReceivables: number;
  overdueReceivablesValue: number;
  staleServiceOrdersOver5Days: number;
  lowStockProducts: number;
  inactiveCustomers90Days: number;
  activeCustomers: number;
  customersWithPhone: number;
}

export interface SnapshotUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface ExistingRuleRef {
  trigger: AutomationTrigger;
  action: AutomationAction;
}

export interface BusinessSnapshot {
  signals: BusinessSignals;
  users: SnapshotUser[];
  /** Regras que já existem — nenhum gerador deve propor uma repetida. */
  existingRules: (ExistingRuleRef & { name: string; isActive: boolean })[];
  /** Sugestões que o usuário já recusou — não voltam. */
  dismissed: ExistingRuleRef[];
  /** Falso quando não há absolutamente nada acontecendo: não há o que sugerir. */
  hasAnySignal: boolean;
}

/**
 * Monta o retrato do negócio a partir do banco.
 *
 * Estava embutido no AutomationSuggestionsService; virou serviço próprio
 * quando o gerador de sugestões passou a ser plugável — os dois motores
 * (regras e IA) leem exatamente os mesmos números, então uma diferença entre
 * eles é sempre de interpretação, nunca de dado.
 */
@Injectable()
export class BusinessSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async build(): Promise<BusinessSnapshot> {
    const at = (days: number) => new Date(Date.now() - days * DAY_MS);

    const [
      users,
      existingRules,
      dismissedRows,
      pendingQuotes,
      staleOpportunities,
      overdueReceivables,
      staleServiceOrders,
      lowStockProducts,
      inactiveCustomers90Days,
      customersWithPhone,
      activeCustomers,
    ] = await Promise.all([
      this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, role: true } }),
      this.prisma.automationRule.findMany({ select: { name: true, trigger: true, action: true, isActive: true } }),
      this.prisma.automationSuggestion.findMany({
        where: { status: AutomationSuggestionStatus.DISMISSED },
        select: { trigger: true, action: true },
      }),
      this.prisma.quote.aggregate({
        where: { status: QuoteStatus.PENDING, createdAt: { lt: at(3) } },
        _count: true,
        _sum: { total: true },
      }),
      this.prisma.opportunity.count({ where: { status: OpportunityStatus.OPEN, stageChangedAt: { lt: at(7) } } }),
      this.prisma.financialEntry.aggregate({
        where: {
          type: FinancialEntryType.RECEIVABLE,
          status: { in: [FinancialEntryStatus.PENDING, FinancialEntryStatus.OVERDUE] },
          dueDate: { lt: new Date() },
        },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.serviceOrder.count({
        where: { status: { in: [ServiceOrderStatus.OPEN, ServiceOrderStatus.IN_PROGRESS] }, updatedAt: { lt: at(5) } },
      }),
      this.countLowStock(),
      this.countInactiveCustomers(at(90)),
      this.prisma.customer.count({ where: { isActive: true, phone: { not: null } } }),
      this.prisma.customer.count({ where: { isActive: true } }),
    ]);

    const signals: BusinessSignals = {
      pendingQuotesOver3Days: pendingQuotes._count,
      pendingQuotesValue: Number(pendingQuotes._sum.total ?? 0),
      staleOpportunitiesOver7Days: staleOpportunities,
      overdueReceivables: overdueReceivables._count,
      overdueReceivablesValue: Number(overdueReceivables._sum.amount ?? 0),
      staleServiceOrdersOver5Days: staleServiceOrders,
      lowStockProducts,
      inactiveCustomers90Days,
      activeCustomers,
      customersWithPhone,
    };

    const hasAnySignal =
      signals.pendingQuotesOver3Days +
        signals.staleOpportunitiesOver7Days +
        signals.overdueReceivables +
        signals.staleServiceOrdersOver5Days +
        signals.lowStockProducts +
        signals.inactiveCustomers90Days >
      0;

    return { signals, users, existingRules, dismissed: dismissedRows, hasAnySignal };
  }

  /**
   * minStock = 0 significa "não controlo mínimo pra este item". Sem esse
   * filtro, todo produto zerado no estoque entraria na conta.
   */
  private async countLowStock(): Promise<number> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true, minStock: { gt: 0 } },
      select: { minStock: true, stockItems: { select: { quantity: true } } },
      take: 1000,
    });
    return products.filter((p) => p.stockItems.reduce((sum, s) => sum + s.quantity, 0) <= p.minStock).length;
  }

  /**
   * "Sem comprar há X dias" pressupõe que já comprou: quem nunca comprou é
   * lead, não cliente inativo. Por isso parte das vendas confirmadas.
   */
  private async countInactiveCustomers(cutoff: Date): Promise<number> {
    const lastPurchase = await this.prisma.sale.groupBy({
      by: ['customerId'],
      where: { status: SaleStatus.CONFIRMED, customerId: { not: null } },
      _max: { confirmedAt: true },
    });
    const inactiveIds = lastPurchase
      .filter((g) => g._max.confirmedAt !== null && (g._max.confirmedAt as Date) < cutoff)
      .map((g) => g.customerId as string);
    if (inactiveIds.length === 0) return 0;
    return this.prisma.customer.count({ where: { id: { in: inactiveIds }, isActive: true } });
  }
}
