'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { CabecalhoDaLoja } from '@/components/print/CabecalhoDaLoja';
import { PrintToolbar } from '@/components/print/PrintToolbar';
import type { Sale, TenantSettings } from '@/lib/types';

// Record<string, ...> e não Record<PaymentMethod, ...> de propósito: se a API
// passar a devolver uma forma de pagamento nova, o cupom imprime o código cru
// em vez de "undefined".
const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Dinheiro',
  DEBIT_CARD: 'Cartão de débito',
  CREDIT_CARD: 'Cartão de crédito',
  PIX: 'PIX',
  BOLETO: 'Boleto',
};

const brl = (v: number | string) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Cupom da venda, dimensionado para bobina térmica de 80mm.
 *
 * Não é documento fiscal — é o comprovante que o cliente leva do balcão. A
 * nota fiscal continua sendo emitida pelo módulo Fiscal, separadamente; o
 * rodapé diz isso com todas as letras para ninguém confundir os dois.
 */
export default function PrintSalePage() {
  const params = useParams<{ id: string }>();
  const [sale, setSale] = useState<Sale | null>(null);
  const [store, setStore] = useState<TenantSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<Sale>(`/sales/${params.id}`), api.get<TenantSettings>('/settings')])
      .then(([saleData, storeData]) => {
        setSale(saleData);
        setStore(storeData);
      })
      .catch(() => setError('Não foi possível carregar a venda.'));
  }, [params.id]);

  if (error) return <p className="print-center">{error}</p>;
  if (!sale || !store) return <p className="print-center">Carregando…</p>;

  const paid = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const cashPaid = sale.payments
    .filter((p) => p.method === 'CASH')
    .reduce((sum, p) => sum + Number(p.amount), 0);
  // Troco só faz sentido quando entrou dinheiro a mais que o total.
  const change = Math.max(0, Math.round((paid - Number(sale.total)) * 100) / 100);

  return (
    <>
      <PrintToolbar ready />

      <div className="print-page print-page--receipt">
        <CabecalhoDaLoja loja={store} formato="cupom" />

        <hr className="print-hr" />

        <div className="print-row">
          <span>Venda</span>
          <span className="print-bold">#{sale.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="print-row">
          <span>Data</span>
          <span>{new Date(sale.confirmedAt ?? sale.createdAt).toLocaleString('pt-BR')}</span>
        </div>
        {sale.seller?.name && (
          <div className="print-row">
            <span>Atendente</span>
            <span>{sale.seller.name}</span>
          </div>
        )}
        {sale.customer?.name && (
          <div className="print-row">
            <span>Cliente</span>
            <span>{sale.customer.name}</span>
          </div>
        )}

        <hr className="print-hr" />

        <table className="print-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Qtd</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.description ?? item.product?.name ?? 'Item'}
                  <br />
                  <span className="print-muted">{brl(item.unitPrice)} un.</span>
                </td>
                <td className="num">{item.quantity}</td>
                {/* item.total já vem calculado pela API com o desconto da
                    linha aplicado — recalcular aqui daria divergência. */}
                <td className="num">{brl(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <hr className="print-hr" />

        <div className="print-row">
          <span>Subtotal</span>
          <span>{brl(sale.subtotal)}</span>
        </div>
        {Number(sale.discount) > 0 && (
          <div className="print-row">
            <span>Desconto</span>
            <span>− {brl(sale.discount)}</span>
          </div>
        )}
        {Number(sale.shippingCost ?? 0) > 0 && (
          <div className="print-row">
            <span>Frete</span>
            <span>{brl(sale.shippingCost as string)}</span>
          </div>
        )}
        {Number(sale.cardFeeAmount ?? 0) > 0 && (
          <div className="print-row">
            <span>Taxa do cartão</span>
            <span>{brl(sale.cardFeeAmount as string)}</span>
          </div>
        )}
        <div className="print-row print-bold" style={{ fontSize: 13, marginTop: 4 }}>
          <span>TOTAL</span>
          <span>{brl(sale.total)}</span>
        </div>

        <hr className="print-hr" />

        {sale.payments.map((p) => (
          <div key={p.id} className="print-row">
            <span>
              {PAYMENT_LABEL[p.method] ?? p.method}
              {p.installments > 1 ? ` ${p.installments}x` : ''}
            </span>
            <span>{brl(p.amount)}</span>
          </div>
        ))}
        {change > 0 && cashPaid > 0 && (
          <div className="print-row print-bold">
            <span>Troco</span>
            <span>{brl(change)}</span>
          </div>
        )}

        {sale.notes && (
          <>
            <hr className="print-hr" />
            <div className="print-muted">{sale.notes}</div>
          </>
        )}

        <hr className="print-hr" />

        <div className="print-center print-muted">
          <div>Documento sem valor fiscal</div>
          <div>Obrigado pela preferência!</div>
        </div>
      </div>
    </>
  );
}
