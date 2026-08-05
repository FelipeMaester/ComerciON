'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { formatCalendarDate } from '@/lib/format';
import type { Customer, FinancialEntry, FinancialEntryType, Supplier } from '@/lib/types';

const TYPE_LABEL: Record<FinancialEntryType, string> = {
  PAYABLE: 'A pagar',
  RECEIVABLE: 'A receber',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  OVERDUE: 'Vencido',
  CANCELED: 'Cancelado',
};

export default function FinancePage() {
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [type, setType] = useState<FinancialEntryType | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  async function load(typeFilter?: FinancialEntryType | '') {
    setLoading(true);
    setError(null);
    try {
      const query = typeFilter ? `?type=${typeFilter}` : '';
      const data = await api.get<FinancialEntry[]>(`/finance/entries${query}`);
      setEntries(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os lançamentos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    api.get<Customer[]>('/customers').then(setCustomers).catch(() => undefined);
    api.get<Supplier[]>('/suppliers').then(setSuppliers).catch(() => undefined);
  }, []);

  async function markPaid(id: string) {
    await api.patch(`/finance/entries/${id}/pay`);
    load(type);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Financeiro</h1>
        <div className="flex gap-2">
          <Link href="/finance/cashflow" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            Fluxo de caixa
          </Link>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            {showForm ? 'Cancelar' : 'Novo lançamento'}
          </button>
        </div>
      </div>

      <select
        className="input mb-4 max-w-xs"
        value={type}
        onChange={(e) => {
          const value = e.target.value as FinancialEntryType | '';
          setType(value);
          load(value);
        }}
      >
        <option value="">Todos os lançamentos</option>
        <option value="PAYABLE">Contas a pagar</option>
        <option value="RECEIVABLE">Contas a receber</option>
      </select>

      {showForm && (
        <CreateEntryForm
          customers={customers}
          suppliers={suppliers}
          onCreated={() => {
            setShowForm(false);
            load(type);
          }}
        />
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : (
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Descrição</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Vencimento</th>
              <th className="px-4 py-2">Valor</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  {entry.description}
                  {(entry.customer || entry.supplier) && (
                    <div className="text-xs text-slate-400">{entry.customer?.name ?? entry.supplier?.name}</div>
                  )}
                </td>
                <td className="px-4 py-2">{TYPE_LABEL[entry.type]}</td>
                <td className="px-4 py-2">{formatCalendarDate(entry.dueDate)}</td>
                <td className="px-4 py-2">R$ {Number(entry.amount).toFixed(2)}</td>
                <td className="px-4 py-2">
                  <span
                    className={
                      entry.status === 'PAID'
                        ? 'text-emerald-600'
                        : entry.isOverdue
                          ? 'text-red-600'
                          : entry.status === 'CANCELED'
                            ? 'text-slate-400'
                            : 'text-amber-600'
                    }
                  >
                    {entry.isOverdue ? 'Vencido' : STATUS_LABEL[entry.status]}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  {entry.status === 'PENDING' && (
                    <button onClick={() => markPaid(entry.id)} className="text-slate-500 hover:text-slate-900">
                      Marcar como pago
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Nenhum lançamento encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateEntryForm({
  customers,
  suppliers,
  onCreated,
}: {
  customers: Customer[];
  suppliers: Supplier[];
  onCreated: () => void;
}) {
  const [type, setType] = useState<FinancialEntryType>('PAYABLE');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('0');
  const [dueDate, setDueDate] = useState('');
  const [partyId, setPartyId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/finance/entries', {
        type,
        description,
        category: category || undefined,
        amount: Number(amount),
        dueDate: new Date(dueDate).toISOString(),
        customerId: type === 'RECEIVABLE' ? partyId || undefined : undefined,
        supplierId: type === 'PAYABLE' ? partyId || undefined : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o lançamento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3"
    >
      <select className="input" value={type} onChange={(e) => { setType(e.target.value as FinancialEntryType); setPartyId(''); }}>
        <option value="PAYABLE">Conta a pagar</option>
        <option value="RECEIVABLE">Conta a receber</option>
      </select>
      <input
        className="input sm:col-span-2"
        placeholder="Descrição"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
      />
      <input className="input" placeholder="Categoria (opcional)" value={category} onChange={(e) => setCategory(e.target.value)} />
      <input
        className="input"
        type="number"
        step="0.01"
        placeholder="Valor"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        required
      />
      <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
      <select className="input sm:col-span-3" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
        <option value="">{type === 'PAYABLE' ? 'Sem fornecedor vinculado' : 'Sem cliente vinculado'}</option>
        {(type === 'PAYABLE' ? suppliers : customers).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
