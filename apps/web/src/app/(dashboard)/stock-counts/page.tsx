'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { StockCount, StockCountStatus, Warehouse } from '@/lib/types';

const STATUS_LABEL: Record<StockCountStatus, string> = {
  OPEN: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELED: 'Cancelada',
};

const STATUS_COLOR: Record<StockCountStatus, string> = {
  OPEN: 'text-amber-600 dark:text-amber-400',
  COMPLETED: 'text-emerald-600 dark:text-emerald-400',
  CANCELED: 'text-slate-400 dark:text-slate-500',
};

export default function StockCountsPage() {
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<StockCount[]>('/inventory/stock-counts');
      setCounts(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as contagens de estoque.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    api.get<Warehouse[]>('/warehouses').then(setWarehouses).catch(() => undefined);
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Contagem de estoque</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {showForm ? 'Cancelar' : 'Nova contagem'}
        </button>
      </div>

      {showForm && (
        <CreateStockCountForm
          warehouses={warehouses}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Depósito</th>
                <th className="px-4 py-2">Itens</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{new Date(c.createdAt).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2">
                    <Link href={`/stock-counts/${c.id}`} className="text-slate-900 dark:text-slate-100 hover:underline">
                      {c.warehouse.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{c.items.length}</td>
                  <td className={`px-4 py-2 ${STATUS_COLOR[c.status]}`}>{STATUS_LABEL[c.status]}</td>
                </tr>
              ))}
              {counts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                    Nenhuma contagem de estoque encontrada.
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

function CreateStockCountForm({ warehouses, onCreated }: { warehouses: Warehouse[]; onCreated: () => void }) {
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) setWarehouseId(warehouses[0].id);
  }, [warehouses, warehouseId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/inventory/stock-counts', { warehouseId, notes: notes || undefined });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível abrir a contagem.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:grid-cols-3"
    >
      <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <input
        className="input sm:col-span-2"
        placeholder="Observações (opcional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <p className="col-span-full text-xs text-slate-400 dark:text-slate-500">
        Todos os produtos ativos do depósito entram na contagem, com a quantidade que o sistema tem hoje registrada.
      </p>

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button type="submit" disabled={saving || !warehouseId} className="btn-primary">
          {saving ? 'Abrindo…' : 'Abrir contagem'}
        </button>
      </div>
    </form>
  );
}
