'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Pagination } from '@/components/Pagination';
import type { Paginated, ServiceOrder, ServiceOrderStatus } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

const STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em execução',
  DONE: 'Concluída',
  CANCELED: 'Cancelada',
};

const STATUS_CLASS: Record<ServiceOrderStatus, string> = {
  OPEN: 'text-blue-600 dark:text-blue-400',
  IN_PROGRESS: 'text-amber-700 dark:text-amber-400',
  DONE: 'text-emerald-700 dark:text-emerald-400',
  CANCELED: 'text-tenue',
};

type Filter = ServiceOrderStatus | 'ABERTAS' | 'ATRASADAS';

const FILTROS: Filter[] = ['ABERTAS', 'ATRASADAS', 'OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED'];

/**
 * A regra de "atrasada" saiu daqui.
 *
 * Ela era calculada no navegador, sobre a lista inteira. Agora vive em
 * common/ordem-atrasada, no servidor, junto com a do sino de avisos — que era
 * a segunda cópia da mesma regra. A tela pede pelo nome ("ATRASADAS") e o
 * banco responde; o dia de virada continua sendo o do fuso do servidor, que é
 * o que o relógio da loja marca.
 */

export default function ServiceOrdersPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [pageInfo, setPageInfo] = useState<Paginated<ServiceOrder> | null>(null);
  const [counts, setCounts] = useState<Record<Filter, number>>({
    ABERTAS: 0,
    ATRASADAS: 0,
    OPEN: 0,
    IN_PROGRESS: 0,
    DONE: 0,
    CANCELED: 0,
  });
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Padrão nas que ainda dão trabalho: quem abre esta tela quer saber o que
  // está na bancada, não o histórico inteiro da oficina. O sino de avisos
  // linka com ?situacao=atrasadas e cai direto nas que passaram do dia.
  const atrasadasNoEndereco = useSearchParams().get('situacao') === 'atrasadas';
  const [filter, setFilter] = useState<Filter>(atrasadasNoEndereco ? 'ATRASADAS' : 'ABERTAS');

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(page), situacao: filter });
        if (busca.trim()) query.set('search', busca.trim());
        const [pagina, numeros] = await Promise.all([
          api.get<Paginated<ServiceOrder>>(`/service-orders?${query.toString()}`),
          // Os contadores vêm do banco. Contá-los no navegador sobre uma lista
          // paginada faria "7 atrasadas" virar "2" — e nada na tela daria a
          // entender que o número passou a ser o da página.
          api.get<Record<Filter, number>>('/service-orders/contagens'),
        ]);
        setOrders(pagina.items);
        setPageInfo(pagina);
        setCounts(numeros);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as ordens de serviço.');
      } finally {
        setLoading(false);
      }
    },
    [filter, busca],
  );

  useEffect(() => {
    const timer = setTimeout(() => load(1), 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    setFilter(atrasadasNoEndereco ? 'ATRASADAS' : 'ABERTAS');
  }, [atrasadasNoEndereco]);

  async function changeStatus(order: ServiceOrder, status: ServiceOrderStatus) {
    try {
      await api.patch(`/service-orders/${order.id}/status`, { status });
      load(pageInfo?.page ?? 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível alterar o status.');
    }
  }

  return (
    <div>
      <h1 className="mb-4 titulo-pagina">Ordens de serviço</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => {
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

      {/* Com dois anos de oficina, achar a ordem do carro que chegou não pode
          ser passar página até ela. */}
      <input
        className="input mb-4 w-full sm:max-w-sm"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por cliente ou placa…"
      />

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
                <th>Situação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
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
                        <button onClick={() => changeStatus(o, 'DONE')} className="text-xs underline text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">
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
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-tenue">
                    {busca.trim()
                      ? `Nenhuma ordem para “${busca.trim()}”.`
                      : filter === 'ABERTAS'
                        ? 'Nenhuma ordem em aberto — bancada limpa.'
                        : 'Nenhuma ordem neste status.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination data={pageInfo} onPageChange={(p) => load(p)} itemLabel="ordens" />
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
