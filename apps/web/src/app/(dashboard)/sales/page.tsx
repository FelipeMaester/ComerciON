'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { BuscaSemResultado, ListaVazia } from '@/components/ListaVazia';
import { getSaleFlowStatus } from '@/lib/saleStatus';
import { Pagination } from '@/components/Pagination';
import type { Paginated, Sale, SaleStatus } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

const STATUS_LABEL: Record<SaleStatus, string> = {
  QUOTE: 'Orçamento',
  CONFIRMED: 'Confirmada',
  CANCELED: 'Cancelada',
  RETURNED: 'Devolvida',
};

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [pageInfo, setPageInfo] = useState<Paginated<Sale> | null>(null);
  const [status, setStatus] = useState<SaleStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(statusFilter?: SaleStatus | '', page = 1) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (statusFilter) params.set('status', statusFilter);
      const data = await api.get<Paginated<Sale>>(`/sales?${params}`);
      setSales(data.items);
      setPageInfo(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as vendas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="titulo-pagina">Vendas</h1>
        <Link href="/pos" className="btn-primary">
          Nova venda
        </Link>
      </div>

      <select
        className="input mb-4 max-w-xs"
        value={status}
        onChange={(e) => {
          const value = e.target.value as SaleStatus | '';
          setStatus(value);
          load(value);
        }}
      >
        <option value="">Todos os status</option>
        {Object.entries(STATUS_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <CarregandoLista />
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="tabela card">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th className="num">Itens</th>
                <th className="num">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const flowStatus = getSaleFlowStatus(s);
                return (
                  <tr key={s.id}>
                    <td className="text-xs text-suave">{new Date(s.createdAt).toLocaleString('pt-BR')}</td>
                    <td>
                      <Link href={`/sales/${s.id}`} className="text-texto hover:underline">
                        {s.customer?.name ?? 'Cliente avulso'}
                      </Link>
                    </td>
                    <td className="num">{s.items.length}</td>
                    <td className="num font-medium">{formatarMoeda(Number(s.total))}</td>
                    <td><span className={`${flowStatus.badgeClass} whitespace-nowrap`}>{flowStatus.label}</span></td>
                  </tr>
                );
              })}
              {sales.length === 0 && (
                <ListaVazia
                  icone="vendas"
                  titulo="Nenhuma venda por aqui."
                  descricao="As vendas feitas no PDV aparecem nesta lista."
                  acao={{ rotulo: 'Abrir o PDV', href: '/pos' }}
                  colunas={5}
                />
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination data={pageInfo} onPageChange={(p) => load(status, p)} itemLabel="vendas" />
    </div>
  );
}
