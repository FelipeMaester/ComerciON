'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { StockCount, StockCountStatus, Warehouse } from '@/lib/types';

const STATUS_LABEL: Record<StockCountStatus, string> = {
  OPEN: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELED: 'Cancelada',
};

const STATUS_COLOR: Record<StockCountStatus, string> = {
  OPEN: 'text-amber-700 dark:text-amber-400',
  COMPLETED: 'text-emerald-700 dark:text-emerald-400',
  CANCELED: 'text-tenue',
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
        <h1 className="titulo-pagina">Contagem de estoque</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary"
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
        <CarregandoLista />
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="tabela card">
            <thead>
              <tr>
                <th>Data</th>
                <th>Depósito</th>
                <th>Itens</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id}>
                  <td className="text-xs text-suave">{new Date(c.createdAt).toLocaleString('pt-BR')}</td>
                  <td>
                    <Link href={`/stock-counts/${c.id}`} className="text-texto hover:underline">
                      {c.warehouse.name}
                    </Link>
                  </td>
                  <td>{c.items.length}</td>
                  <td className={`px-4 py-2 ${STATUS_COLOR[c.status]}`}>{STATUS_LABEL[c.status]}</td>
                </tr>
              ))}
              {counts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-tenue">
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
      className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-3"
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

      <p className="col-span-full text-xs text-tenue">
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
