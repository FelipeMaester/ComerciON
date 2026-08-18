'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { encurtarIds, formatCalendarDate, formatarMoeda } from '@/lib/format';
import type { Customer, Paginated, FinancialEntry, FinancialEntryType, Supplier } from '@/lib/types';

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
    api.get<Paginated<Customer>>('/customers?pageSize=100').then((d) => setCustomers(d.items)).catch(() => undefined);
    api.get<Supplier[]>('/suppliers').then(setSuppliers).catch(() => undefined);
  }, []);

  async function markPaid(id: string) {
    await api.patch(`/finance/entries/${id}/pay`);
    load(type);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="titulo-pagina">Financeiro</h1>
        <div className="flex gap-2">
          <Link href="/finance/cashflow" className="btn-secondary">
            Fluxo de caixa
          </Link>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary"
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

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <CarregandoLista />
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="tabela card">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Tipo</th>
                <th>Vencimento</th>
                <th className="num">Valor</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <span className="font-medium">{encurtarIds(entry.description)}</span>
                    {(entry.customer || entry.supplier) && (
                      <div className="text-xs text-tenue">{entry.customer?.name ?? entry.supplier?.name}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-suave">{TYPE_LABEL[entry.type]}</td>
                  <td className="whitespace-nowrap">{formatCalendarDate(entry.dueDate)}</td>
                  <td className="num font-medium">{formatarMoeda(Number(entry.amount))}</td>
                  <td>
                    <span
                      className={`badge ${
                        entry.status === 'PAID'
                          ? 'badge-ok'
                          : entry.isOverdue
                            ? 'badge-erro'
                            : entry.status === 'CANCELED'
                              ? 'badge-neutro'
                              : 'badge-alerta'
                      }`}
                    >
                      {entry.isOverdue ? 'Vencido' : STATUS_LABEL[entry.status]}
                    </span>
                  </td>
                  <td className="text-right">
                    {entry.status === 'PENDING' && (
                      <button onClick={() => markPaid(entry.id)} className="btn-secondary btn-sm whitespace-nowrap">
                        Marcar como pago
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-tenue">
                    Nenhum lançamento encontrado.
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
      className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-3"
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

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
