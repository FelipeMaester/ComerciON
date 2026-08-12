'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { ServiceOrder, ServiceOrderStatus } from '@/lib/types';

const STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em execução',
  DONE: 'Concluída',
  CANCELED: 'Cancelada',
};

const STATUS_CLASS: Record<ServiceOrderStatus, string> = {
  OPEN: 'text-blue-600 dark:text-blue-400',
  IN_PROGRESS: 'text-amber-600 dark:text-amber-400',
  DONE: 'text-emerald-600 dark:text-emerald-400',
  CANCELED: 'text-slate-400 dark:text-slate-500',
};

type Filter = ServiceOrderStatus | 'ABERTAS';

export default function ServiceOrdersPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Padrão nas que ainda dão trabalho: quem abre esta tela quer saber o que
  // está na bancada, não o histórico inteiro da oficina.
  const [filter, setFilter] = useState<Filter>('ABERTAS');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setOrders(await api.get<ServiceOrder[]>('/service-orders'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as ordens de serviço.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    const list = filter === 'ABERTAS' ? orders.filter((o) => o.status === 'OPEN' || o.status === 'IN_PROGRESS') : orders.filter((o) => o.status === filter);
    // Agendadas primeiro, na ordem do horário; sem data vão para o fim.
    return [...list].sort((a, b) => {
      if (a.scheduledAt && b.scheduledAt) return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      if (a.scheduledAt) return -1;
      if (b.scheduledAt) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [orders, filter]);

  const counts = useMemo(
    () => ({
      ABERTAS: orders.filter((o) => o.status === 'OPEN' || o.status === 'IN_PROGRESS').length,
      OPEN: orders.filter((o) => o.status === 'OPEN').length,
      IN_PROGRESS: orders.filter((o) => o.status === 'IN_PROGRESS').length,
      DONE: orders.filter((o) => o.status === 'DONE').length,
      CANCELED: orders.filter((o) => o.status === 'CANCELED').length,
    }),
    [orders],
  );

  async function changeStatus(order: ServiceOrder, status: ServiceOrderStatus) {
    try {
      await api.patch(`/service-orders/${order.id}/status`, { status });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível alterar o status.');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Ordens de serviço</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['ABERTAS', 'OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              filter === f
                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
            }`}
          >
            {f === 'ABERTAS' ? 'Na bancada' : STATUS_LABEL[f]} ({counts[f]})
          </button>
        ))}
      </div>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-900">
            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Aberta em</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Veículo</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2">Agendada</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
                  <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-2">
                    {o.quote ? (
                      <Link href={`/quotes/${o.quote.id}`} className="text-slate-900 hover:underline dark:text-slate-100">
                        {o.customer?.name ?? '—'}
                      </Link>
                    ) : (
                      (o.customer?.name ?? '—')
                    )}
                  </td>
                  <td className="px-4 py-2">{o.vehicle?.plate ?? '—'}</td>
                  <td className="px-4 py-2">R$ {Number(o.total).toFixed(2)}</td>
                  <td className="px-4 py-2 text-xs">
                    {o.scheduledAt ? (
                      <ScheduleCell isoDate={o.scheduledAt} pending={o.status === 'OPEN' || o.status === 'IN_PROGRESS'} />
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">—</span>
                    )}
                  </td>
                  <td className={`px-4 py-2 ${STATUS_CLASS[o.status]}`}>{STATUS_LABEL[o.status]}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      {o.status === 'OPEN' && (
                        <button onClick={() => changeStatus(o, 'IN_PROGRESS')} className="text-xs underline text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100">
                          Iniciar
                        </button>
                      )}
                      {o.status === 'IN_PROGRESS' && (
                        <button onClick={() => changeStatus(o, 'DONE')} className="text-xs underline text-emerald-600 hover:text-emerald-800 dark:text-emerald-400">
                          Concluir
                        </button>
                      )}
                      <a
                        href={`/print/service-order/${o.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        Imprimir
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                    {filter === 'ABERTAS' ? 'Nenhuma ordem em aberto — bancada limpa.' : 'Nenhuma ordem neste status.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Destaca agendamento vencido — o serviço que passou da hora e ninguém tocou. */
function ScheduleCell({ isoDate, pending }: { isoDate: string; pending: boolean }) {
  const date = new Date(isoDate);
  const atrasado = pending && date < new Date();
  return (
    <span className={atrasado ? 'font-medium text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}>
      {date.toLocaleString('pt-BR')}
      {atrasado && ' (atrasada)'}
    </span>
  );
}
