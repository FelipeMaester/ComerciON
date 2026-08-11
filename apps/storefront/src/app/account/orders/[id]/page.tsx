'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { getTokens } from '@/lib/session';
import type { Order, ShipmentStatus } from '@/lib/types';

const STATUS_LABEL: Record<string, string> = {
  QUOTE: 'Orçamento',
  CONFIRMED: 'Confirmado',
  CANCELED: 'Cancelado',
  RETURNED: 'Devolvido',
};

const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  PENDING: 'Aguardando processamento',
  PROCESSING: 'Em preparação',
  SHIPPED: 'Enviado',
  IN_TRANSIT: 'A caminho',
  DELIVERED: 'Entregue',
  RETURNED: 'Devolvido',
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Dinheiro',
  DEBIT_CARD: 'Cartão de débito',
  CREDIT_CARD: 'Cartão de crédito',
  PIX: 'PIX',
  BOLETO: 'Boleto',
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getTokens()) {
      router.replace(`/login?redirect=/account/orders/${params.id}`);
      return;
    }
    api
      .get<Order>(`/storefront/orders/${params.id}`)
      .then(setOrder)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Pedido não encontrado.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!order) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>;

  return (
    <div>
      <button onClick={() => router.push('/account/orders')} className="mb-4 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
        ← Voltar
      </button>

      <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Pedido {order.id.slice(0, 8)}</h1>
          <span className="text-sm font-medium">{STATUS_LABEL[order.status]}</span>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">{new Date(order.createdAt).toLocaleString('pt-BR')}</p>

        {order.shippingAddress && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Entrega: {order.shippingAddress.street}, {order.shippingAddress.number ?? 's/n'} —{' '}
            {order.shippingAddress.city}/{order.shippingAddress.state}
          </p>
        )}
      </div>

      {order.shipment && (
        <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-3 text-lg font-medium">Rastreio</h2>
          <p className="mb-2 text-sm font-medium">{SHIPMENT_STATUS_LABEL[order.shipment.status]}</p>
          {order.shipment.carrier && (
            <p className="text-sm text-slate-600 dark:text-slate-300">Transportadora: {order.shipment.carrier}</p>
          )}
          {order.shipment.trackingCode && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Código de rastreio: <span className="font-mono">{order.shipment.trackingCode}</span>
            </p>
          )}
          {order.shipment.events && order.shipment.events.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs text-slate-500 dark:text-slate-400">
              {order.shipment.events.map((ev) => (
                <li key={ev.id}>
                  <span className="text-slate-400 dark:text-slate-500">{new Date(ev.createdAt).toLocaleString('pt-BR')}:</span>{' '}
                  {SHIPMENT_STATUS_LABEL[ev.status]}
                  {ev.note ? ` — ${ev.note}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <table className="mb-6 w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-4 py-2">Produto</th>
            <th className="px-4 py-2">Qtd</th>
            <th className="px-4 py-2">Preço unit.</th>
            <th className="px-4 py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-2">{item.description ?? item.product?.name ?? item.productId}</td>
              <td className="px-4 py-2">{item.quantity}</td>
              <td className="px-4 py-2">R$ {Number(item.unitPrice).toFixed(2)}</td>
              <td className="px-4 py-2">R$ {Number(item.total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Subtotal</dt>
            <dd>R$ {Number(order.subtotal).toFixed(2)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Desconto</dt>
            <dd>R$ {Number(order.discount).toFixed(2)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Frete</dt>
            <dd>R$ {Number(order.shippingCost ?? 0).toFixed(2)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>R$ {Number(order.total).toFixed(2)}</dd>
          </div>
        </dl>
      </div>

      <h2 className="mb-3 text-lg font-medium">Pagamento</h2>
      <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-4 py-2">Forma</th>
            <th className="px-4 py-2">Parcelas</th>
            <th className="px-4 py-2">Valor</th>
          </tr>
        </thead>
        <tbody>
          {order.payments.map((p) => (
            <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-2">{PAYMENT_LABEL[p.method]}</td>
              <td className="px-4 py-2">{p.installments}x</td>
              <td className="px-4 py-2">R$ {Number(p.amount).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
