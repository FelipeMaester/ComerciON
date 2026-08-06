'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { Customer, CustomerVehicle, Product, Quote, QuoteStatus } from '@/lib/types';

const STATUS_LABEL: Record<QuoteStatus, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
};

const STATUS_COLOR: Record<QuoteStatus, string> = {
  PENDING: 'text-amber-600 dark:text-amber-400',
  APPROVED: 'text-emerald-600 dark:text-emerald-400',
  REJECTED: 'text-red-600 dark:text-red-400',
};

interface ItemDraft {
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_ITEM: ItemDraft = { productId: '', description: '', quantity: '1', unitPrice: '' };

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Quote[]>('/quotes');
      setQuotes(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os orçamentos.');
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
        <h1 className="text-xl font-semibold">Orçamentos</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {showForm ? 'Cancelar' : 'Novo orçamento'}
        </button>
      </div>

      {showForm && (
        <CreateQuoteForm
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
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Data</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Veículo</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Ordem de serviço</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{new Date(q.createdAt).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-2">
                  <Link href={`/quotes/${q.id}`} className="text-slate-900 dark:text-slate-100 hover:underline">
                    {q.customer && 'name' in q.customer ? q.customer.name : '—'}
                  </Link>
                </td>
                <td className="px-4 py-2">{q.vehicle && 'plate' in q.vehicle ? q.vehicle.plate : '—'}</td>
                <td className="px-4 py-2">R$ {Number(q.total).toFixed(2)}</td>
                <td className={`px-4 py-2 ${STATUS_COLOR[q.status]}`}>{STATUS_LABEL[q.status]}</td>
                <td className="px-4 py-2">
                  {q.serviceOrder ? (
                    <Link href={`/service-orders/${q.serviceOrder.id}`} className="text-slate-900 dark:text-slate-100 hover:underline">
                      Ver ordem
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
            {quotes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  Nenhum orçamento encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateQuoteForm({ onCreated }: { onCreated: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vehicles, setVehicles] = useState<CustomerVehicle[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [itemDraft, setItemDraft] = useState<ItemDraft>(EMPTY_ITEM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Customer[]>('/customers').then(setCustomers).catch(() => undefined);
    api.get<Product[]>('/products').then(setProducts).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!customerId) {
      setVehicles([]);
      setVehicleId('');
      return;
    }
    api
      .get<Customer>(`/customers/${customerId}`)
      .then((c) => setVehicles(c.vehicles ?? []))
      .catch(() => setVehicles([]));
    setVehicleId('');
  }, [customerId]);

  function addItem() {
    if (!itemDraft.description.trim() || !itemDraft.unitPrice) return;
    setItems((prev) => [...prev, itemDraft]);
    setItemDraft(EMPTY_ITEM);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function pickProduct(productId: string) {
    const product = products.find((p) => p.id === productId);
    setItemDraft((d) => ({
      ...d,
      productId,
      description: product ? product.name : d.description,
      unitPrice: product ? product.price : d.unitPrice,
    }));
  }

  const total = items.reduce((sum, i) => sum + Number(i.quantity || 0) * Number(i.unitPrice || 0), 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customerId) {
      setError('Selecione um cliente.');
      return;
    }
    if (items.length === 0) {
      setError('Adicione ao menos um item.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/quotes', {
        customerId,
        vehicleId: vehicleId || undefined,
        description: description || undefined,
        items: items.map((i) => ({
          productId: i.productId || undefined,
          description: i.description,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        })),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o orçamento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:grid-cols-2"
    >
      <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
        <option value="">Selecione o cliente…</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={vehicles.length === 0}>
        <option value="">Veículo (opcional)</option>
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {[v.plate, v.brand, v.model].filter(Boolean).join(' · ')}
          </option>
        ))}
      </select>

      <textarea
        className="input col-span-full"
        placeholder="Problema relatado / observações (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="col-span-full space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
        <p className="text-sm font-medium">Itens (peças e/ou mão de obra)</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <select className="input sm:col-span-1" value={itemDraft.productId} onChange={(e) => pickProduct(e.target.value)}>
            <option value="">Peça (opcional)</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            className="input sm:col-span-2"
            placeholder="Descrição*"
            value={itemDraft.description}
            onChange={(e) => setItemDraft((d) => ({ ...d, description: e.target.value }))}
          />
          <input
            className="input"
            type="number"
            step={1}
            min={1}
            placeholder="Qtd"
            value={itemDraft.quantity}
            onChange={(e) => setItemDraft((d) => ({ ...d, quantity: e.target.value }))}
          />
          <input
            className="input"
            type="number"
            step="0.01"
            min={0}
            placeholder="Preço unit."
            value={itemDraft.unitPrice}
            onChange={(e) => setItemDraft((d) => ({ ...d, unitPrice: e.target.value }))}
          />
        </div>
        <button type="button" onClick={addItem} className="btn-secondary">
          Adicionar item
        </button>

        {items.length > 0 && (
          <ul className="space-y-1">
            {items.map((item, index) => (
              <li
                key={index}
                className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <span>
                  {item.quantity}x {item.description} — R$ {Number(item.unitPrice).toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && <p className="text-right text-sm font-medium">Total: R$ {total.toFixed(2)}</p>}
      </div>

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Salvando…' : 'Salvar orçamento'}
        </button>
      </div>
    </form>
  );
}
