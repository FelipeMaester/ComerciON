'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { getSaleFlowStatus } from '@/lib/saleStatus';
import { Pagination } from '@/components/Pagination';
import type { Paginated, Sale, SaleStatus } from '@/lib/types';

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
        <h1 className="text-xl font-semibold">Vendas</h1>
        <Link href="/pos" className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
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
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Itens</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const flowStatus = getSaleFlowStatus(s);
                return (
                  <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{new Date(s.createdAt).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2">
                      <Link href={`/sales/${s.id}`} className="text-slate-900 dark:text-slate-100 hover:underline">
                        {s.customer?.name ?? 'Cliente avulso'}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{s.items.length}</td>
                    <td className="px-4 py-2">R$ {Number(s.total).toFixed(2)}</td>
                    <td className={`px-4 py-2 ${flowStatus.colorClass}`}>{flowStatus.label}</td>
                  </tr>
                );
              })}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                    Nenhuma venda encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination data={pageInfo} onPageChange={(p) => load(status, p)} itemLabel="vendas" />
    </div>
  );
}
