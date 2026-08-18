'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { ServiceOrder, ServiceOrderStatus } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

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
  CANCELED: 'text-tenue',
};

/**
 * Atrasada é a que tem dia marcado no passado e ainda não saiu da bancada.
 *
 * A comparação é com o começo de HOJE, e não com o instante agora: uma OS
 * agendada para as 14h não está atrasada às 9h da manhã do mesmo dia. Mesma
 * regra que a API usa para contar o aviso — se as duas discordassem, o sino
 * diria "3 atrasadas" e a tela mostraria outra quantidade.
 */
function estaAtrasada(ordem: ServiceOrder): boolean {
  if (ordem.status !== 'OPEN' && ordem.status !== 'IN_PROGRESS') return false;
  if (!ordem.scheduledAt) return false;
  const agora = new Date();
  const inicioDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return new Date(ordem.scheduledAt) < inicioDeHoje;
}

type Filter = ServiceOrderStatus | 'ABERTAS' | 'ATRASADAS';

export default function ServiceOrdersPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Padrão nas que ainda dão trabalho: quem abre esta tela quer saber o que
  // está na bancada, não o histórico inteiro da oficina. O sino de avisos
  // linka com ?situacao=atrasadas e cai direto nas que passaram do dia.
  const atrasadasNoEndereco = useSearchParams().get('situacao') === 'atrasadas';
  const [filter, setFilter] = useState<Filter>(atrasadasNoEndereco ? 'ATRASADAS' : 'ABERTAS');

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

  useEffect(() => {
    setFilter(atrasadasNoEndereco ? 'ATRASADAS' : 'ABERTAS');
  }, [atrasadasNoEndereco]);

  const visible = useMemo(() => {
    const list =
      filter === 'ABERTAS'
        ? orders.filter((o) => o.status === 'OPEN' || o.status === 'IN_PROGRESS')
        : filter === 'ATRASADAS'
          ? orders.filter(estaAtrasada)
          : orders.filter((o) => o.status === filter);
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
      ATRASADAS: orders.filter(estaAtrasada).length,
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
      <h1 className="mb-4 titulo-pagina">Ordens de serviço</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['ABERTAS', 'ATRASADAS', 'OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED'] as Filter[]).map((f) => {
          // "Atrasadas" só aparece quando existe alguma: um filtro que vive
          // marcando zero vira ruído, e a bancada limpa merece ficar limpa.
          if (f === 'ATRASADAS' && counts.ATRASADAS === 0 && filter !== 'ATRASADAS') return null;
          const atrasadas = f === 'ATRASADAS';
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                filter === f
                  ? 'border-marca bg-marca-solida text-marca-texto'
                  : atrasadas
                    ? 'border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400'
                    : 'border-linha hover:bg-realce'
              }`}
            >
              {f === 'ABERTAS' ? 'Na bancada' : atrasadas ? 'Atrasadas' : STATUS_LABEL[f]} ({counts[f]})
            </button>
          );
        })}
      </div>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <CarregandoLista />
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="tabela card">
            <thead>
              <tr>
                <th>Aberta em</th>
                <th>Cliente</th>
                <th>Veículo</th>
                <th>Total</th>
                <th>Agendada</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={o.id}>
                  <td className="text-xs text-suave">
                    {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td>
                    {o.quote ? (
                      <Link href={`/quotes/${o.quote.id}`} className="text-texto hover:underline">
                        {o.customer?.name ?? '—'}
                      </Link>
                    ) : (
                      (o.customer?.name ?? '—')
                    )}
                  </td>
                  <td>{o.vehicle?.plate ?? '—'}</td>
                  <td>{formatarMoeda(Number(o.total))}</td>
                  <td className="text-xs">
                    {o.scheduledAt ? (
                      <ScheduleCell isoDate={o.scheduledAt} pending={o.status === 'OPEN' || o.status === 'IN_PROGRESS'} />
                    ) : (
                      <span className="text-tenue">—</span>
                    )}
                  </td>
                  <td className={`px-4 py-2 ${STATUS_CLASS[o.status]}`}>{STATUS_LABEL[o.status]}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-3">
                      {o.status === 'OPEN' && (
                        <button onClick={() => changeStatus(o, 'IN_PROGRESS')} className="text-xs underline text-suave hover:text-texto">
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
                        className="text-xs underline text-suave hover:text-texto"
                      >
                        Imprimir
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-tenue">
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
    <span className={atrasado ? 'font-medium text-red-600 dark:text-red-400' : 'text-suave'}>
      {date.toLocaleString('pt-BR')}
      {atrasado && ' (atrasada)'}
    </span>
  );
}
