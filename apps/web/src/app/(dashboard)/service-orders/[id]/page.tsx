'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { ServiceOrder, ServiceOrderStatus } from '@/lib/types';

const STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  CANCELED: 'Cancelada',
};

export default function ServiceOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<ServiceOrder | null>(null);
  const [status, setStatus] = useState<ServiceOrderStatus>('OPEN');
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await api.get<ServiceOrder>(`/service-orders/${params.id}`);
      setOrder(data);
      setStatus(data.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a ordem de serviço.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function saveStatus() {
    if (!order || status === order.status) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.patch(`/service-orders/${order.id}/status`, { status });
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o status.');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorNotice message={error} />;
  if (!order) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>;

  const customerName = order.customer && 'name' in order.customer ? order.customer.name : '—';

  return (
    <div>
      <button
        onClick={() => router.push('/service-orders')}
        className="mb-4 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
      >
        ← Voltar
      </button>

      <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{customerName}</h1>
          <span className="text-sm font-medium">{STATUS_LABEL[order.status]}</span>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-4">
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Data</dt>
            <dd>{new Date(order.createdAt).toLocaleString('pt-BR')}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Veículo</dt>
            <dd>{order.vehicle && 'plate' in order.vehicle ? order.vehicle.plate : '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Total</dt>
            <dd className="font-semibold">R$ {Number(order.total).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Orçamento de origem</dt>
            <dd>
              {order.quoteId ? (
                <Link href={`/quotes/${order.quoteId}`} className="text-slate-900 dark:text-slate-100 hover:underline">
                  Ver orçamento
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>

        {order.description && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            <span className="text-slate-400 dark:text-slate-500">Observações: </span>
            {order.description}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
          <select className="input max-w-xs" value={status} onChange={(e) => setStatus(e.target.value as ServiceOrderStatus)}>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button onClick={saveStatus} disabled={busy || status === order.status} className="btn-primary shrink-0">
            {busy ? 'Salvando…' : 'Atualizar status'}
          </button>
        </div>
        {actionError && (
          <div className="mt-3">
            <ErrorNotice message={actionError} />
          </div>
        )}
      </div>

      <h2 className="mb-3 text-lg font-medium">Itens</h2>
      <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-4 py-2">Descrição</th>
            <th className="px-4 py-2">Qtd</th>
            <th className="px-4 py-2">Preço unit.</th>
            <th className="px-4 py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-2">{item.description}</td>
              <td className="px-4 py-2">{item.quantity}</td>
              <td className="px-4 py-2">R$ {Number(item.unitPrice).toFixed(2)}</td>
              <td className="px-4 py-2">R$ {(item.quantity * Number(item.unitPrice)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
