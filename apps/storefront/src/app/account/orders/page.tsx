'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { getTokens } from '@/lib/session';
import type { Order, SaleStatus } from '@/lib/types';

const STATUS_LABEL: Record<SaleStatus, string> = {
  QUOTE: 'Orçamento',
  CONFIRMED: 'Confirmado',
  CANCELED: 'Cancelado',
  RETURNED: 'Devolvido',
};

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login?redirect=/account/orders');
      return;
    }
    api
      .get<Order[]>('/storefront/orders')
      .then(setOrders)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Minha conta</h1>

      <div className="mb-6 flex gap-4 text-sm">
        <Link href="/account" className="text-slate-500 hover:text-slate-900">
          Perfil
        </Link>
        <Link href="/account/orders" className="font-medium text-slate-900">
          Meus pedidos
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : (
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Pedido</th>
              <th className="px-4 py-2">Data</th>
              <th className="px-4 py-2">Itens</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/account/orders/${o.id}`} className="font-mono text-xs text-slate-900 hover:underline">
                    {o.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{new Date(o.createdAt).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-2">{o.items.length}</td>
                <td className="px-4 py-2">R$ {Number(o.total).toFixed(2)}</td>
                <td className="px-4 py-2">{STATUS_LABEL[o.status]}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Você ainda não fez nenhum pedido.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
