'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { ServiceOrder, ServiceOrderStatus } from '@/lib/types';

const STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  CANCELED: 'Cancelada',
};

const STATUS_COLOR: Record<ServiceOrderStatus, string> = {
  OPEN: 'text-amber-600 dark:text-amber-400',
  IN_PROGRESS: 'text-blue-600 dark:text-blue-400',
  DONE: 'text-emerald-600 dark:text-emerald-400',
  CANCELED: 'text-slate-400 dark:text-slate-500',
};

export default function ServiceOrdersPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ServiceOrder[]>('/service-orders')
      .then(setOrders)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as ordens de serviço.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Ordens de serviço</h1>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : (
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Data</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Veículo</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{new Date(o.createdAt).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-2">
                  <Link href={`/service-orders/${o.id}`} className="text-slate-900 dark:text-slate-100 hover:underline">
                    {o.customer && 'name' in o.customer ? o.customer.name : '—'}
                  </Link>
                </td>
                <td className="px-4 py-2">{o.vehicle && 'plate' in o.vehicle ? o.vehicle.plate : '—'}</td>
                <td className="px-4 py-2">R$ {Number(o.total).toFixed(2)}</td>
                <td className={`px-4 py-2 ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  Nenhuma ordem de serviço encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
