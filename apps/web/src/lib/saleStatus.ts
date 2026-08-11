import type { Sale } from './types';

export interface SaleFlowStatus {
  label: string;
  colorClass: string;
}

/**
 * Uma venda confirmada pode ter saldo em aberto (fiado parcial ou total) —
 * o status "Confirmada" sozinho não deixa isso visível, então aqui ele vira
 * "pagamento pendente" até os pagamentos cobrirem o total.
 */
export function getSaleFlowStatus(sale: Sale): SaleFlowStatus {
  if (sale.status === 'QUOTE') {
    return { label: 'Orçamento', colorClass: 'text-amber-600 dark:text-amber-400' };
  }
  if (sale.status === 'CANCELED') {
    return { label: 'Cancelada', colorClass: 'text-slate-400 dark:text-slate-500' };
  }
  if (sale.status === 'RETURNED') {
    return { label: 'Devolvida', colorClass: 'text-red-600 dark:text-red-400' };
  }

  const paid = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const total = Number(sale.total);
  if (paid + 0.01 < total) {
    return { label: 'Confirmada — pagamento pendente', colorClass: 'text-amber-600 dark:text-amber-400' };
  }
  return { label: 'Confirmada — paga', colorClass: 'text-emerald-600 dark:text-emerald-400' };
}
