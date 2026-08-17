import type { Quote } from './types';

export interface QuoteFlowStatus {
  label: string;
  badgeClass: string;
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
    return { label: 'Aguardando aprovação', badgeClass: 'badge badge-alerta' };
  }
  if (quote.status === 'REJECTED') {
    return { label: 'Recusado', badgeClass: 'badge badge-erro' };
  }

  const so = quote.serviceOrder;
  if (!so) {
    return { label: 'Aprovado', badgeClass: 'badge badge-ok' };
  }
  if (so.status === 'CANCELED') {
    return { label: 'Cancelado', badgeClass: 'badge badge-neutro' };
  }
  if (so.status === 'DONE') {
    if (isSalePaid(so.sale)) {
      return { label: 'Concluído — pago', badgeClass: 'badge badge-ok' };
    }
    return { label: 'Concluído — a receber', badgeClass: 'badge badge-alerta' };
  }
  if (so.status === 'IN_PROGRESS') {
    return { label: 'Em execução', badgeClass: 'badge badge-marca' };
  }
  return { label: 'Aprovado — aguardando início', badgeClass: 'badge badge-marca' };
}
