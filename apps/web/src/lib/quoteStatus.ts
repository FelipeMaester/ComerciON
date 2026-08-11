import type { Quote } from './types';

export interface QuoteFlowStatus {
  label: string;
  colorClass: string;
}

/** Considera paga quando a soma dos pagamentos cobre o total da venda. */
export function isSalePaid(sale: NonNullable<NonNullable<Quote['serviceOrder']>['sale']> | null | undefined): boolean {
  if (!sale) return false;
  const paid = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  return paid + 0.01 >= Number(sale.total);
}

/**
 * Um orçamento aprovado vira uma ordem de serviço automaticamente (ver
 * QuotesService.approve no backend) — pro usuário isso é uma única jornada,
 * não dois registros separados. Esse helper resume o status real (orçamento
 * + ordem de serviço + venda) numa única label, pra não precisar abrir uma
 * segunda tela só pra saber "em que pé" o atendimento está.
 */
export function getQuoteFlowStatus(quote: Quote): QuoteFlowStatus {
  if (quote.status === 'PENDING') {
    return { label: 'Aguardando aprovação', colorClass: 'text-amber-600 dark:text-amber-400' };
  }
  if (quote.status === 'REJECTED') {
    return { label: 'Recusado', colorClass: 'text-red-600 dark:text-red-400' };
  }

  const so = quote.serviceOrder;
  if (!so) {
    return { label: 'Aprovado', colorClass: 'text-emerald-600 dark:text-emerald-400' };
  }
  if (so.status === 'CANCELED') {
    return { label: 'Cancelado', colorClass: 'text-slate-400 dark:text-slate-500' };
  }
  if (so.status === 'DONE') {
    if (isSalePaid(so.sale)) {
      return { label: 'Concluído — pago', colorClass: 'text-emerald-600 dark:text-emerald-400' };
    }
    return { label: 'Concluído — pendente de pagamento', colorClass: 'text-amber-600 dark:text-amber-400' };
  }
  if (so.status === 'IN_PROGRESS') {
    return { label: 'Em execução', colorClass: 'text-blue-600 dark:text-blue-400' };
  }
  return { label: 'Aprovado — aguardando início', colorClass: 'text-blue-600 dark:text-blue-400' };
}
