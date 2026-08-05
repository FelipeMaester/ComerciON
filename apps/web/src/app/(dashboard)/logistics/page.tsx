'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice, isPlanLockedError } from '@/components/ErrorNotice';
import type { Sale } from '@/lib/types';

export default function LogisticsPage() {
  const [orders, setOrders] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Sale[]>('/logistics/dispatch-list');
      setOrders(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o romaneio.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function quickCreateShipment(saleId: string) {
    setCreating(saleId);
    try {
      await api.post(`/logistics/shipments/sales/${saleId}`, {});
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o envio.');
    } finally {
      setCreating(null);
    }
  }

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">Romaneio de expedição</h1>
      <p className="mb-6 text-sm text-slate-500">
        Pedidos da loja online confirmados e ainda sem envio registrado — separe para despacho em lote.
      </p>

      {error && (
        <div className="mb-4">
          <ErrorNotice message={error} compact={false} />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : !isPlanLockedError(error ?? '') ? (
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Pedido</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Endereço</th>
              <th className="px-4 py-2">Itens</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/sales/${o.id}`} className="font-mono text-xs text-slate-900 hover:underline">
                    {o.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-2">{o.customer?.name ?? 'Cliente avulso'}</td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {o.shippingAddress
                    ? `${o.shippingAddress.street}, ${o.shippingAddress.number ?? 's/n'} — ${o.shippingAddress.city}/${o.shippingAddress.state}`
                    : '—'}
                </td>
                <td className="px-4 py-2">{o.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                <td className="px-4 py-2">R$ {Number(o.total).toFixed(2)}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => quickCreateShipment(o.id)}
                    disabled={creating === o.id}
                    className="text-slate-500 hover:text-slate-900"
                  >
                    {creating === o.id ? 'Criando…' : 'Criar envio'}
                  </button>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Nenhum pedido aguardando expedição.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
