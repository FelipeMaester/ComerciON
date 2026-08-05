'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import type { Sale, SaleStatus } from '@/lib/types';

const STATUS_LABEL: Record<SaleStatus, string> = {
  QUOTE: 'Orçamento',
  CONFIRMED: 'Confirmada',
  CANCELED: 'Cancelada',
  RETURNED: 'Devolvida',
};

const STATUS_COLOR: Record<SaleStatus, string> = {
  QUOTE: 'text-amber-600',
  CONFIRMED: 'text-emerald-600',
  CANCELED: 'text-slate-400',
  RETURNED: 'text-red-600',
};

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [status, setStatus] = useState<SaleStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(statusFilter?: SaleStatus | '') {
    setLoading(true);
    setError(null);
    try {
      const query = statusFilter ? `?status=${statusFilter}` : '';
      const data = await api.get<Sale[]>(`/sales${query}`);
      setSales(data);
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
        <Link href="/pos" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
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

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : (
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Data</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Itens</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 text-xs text-slate-500">{new Date(s.createdAt).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-2">
                  <Link href={`/sales/${s.id}`} className="text-slate-900 hover:underline">
                    {s.customer?.name ?? 'Cliente avulso'}
                  </Link>
                </td>
                <td className="px-4 py-2">{s.items.length}</td>
                <td className="px-4 py-2">R$ {Number(s.total).toFixed(2)}</td>
                <td className={`px-4 py-2 ${STATUS_COLOR[s.status]}`}>{STATUS_LABEL[s.status]}</td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Nenhuma venda encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
