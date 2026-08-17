import type { Sale } from './types';

export interface SaleFlowStatus {
  label: string;
  badgeClass: string;
}

/**
 * Uma venda confirmada pode ter saldo em aberto (fiado parcial ou total) —
 * o status "Confirmada" sozinho não deixa isso visível, então aqui ele vira
 * "Pagamento pendente" até os pagamentos cobrirem o total, e "Paga" depois.
 *
 * Os rótulos são curtos de propósito: viram etiqueta colorida na lista, e
 * "Confirmada — pagamento pendente" ocupava metade da coluna. O conjunto
 * (Orçamento / Pagamento pendente / Paga / Cancelada / Devolvida) já é
 * inequívoco sem repetir "confirmada" em duas das cinco opções.
 */
export function getSaleFlowStatus(sale: Sale): SaleFlowStatus {
  if (sale.status === 'QUOTE') {
    return { label: 'Orçamento', badgeClass: 'badge badge-alerta' };
  }
  if (sale.status === 'CANCELED') {
    return { label: 'Cancelada', badgeClass: 'badge badge-neutro' };
  }
  if (sale.status === 'RETURNED') {
    return { label: 'Devolvida', badgeClass: 'badge badge-erro' };
  }

  const paid = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const total = Number(sale.total);
  if (paid + 0.01 < total) {
    return { label: 'Pagamento pendente', badgeClass: 'badge badge-alerta' };
  }
  return { label: 'Paga', badgeClass: 'badge badge-ok' };
}
