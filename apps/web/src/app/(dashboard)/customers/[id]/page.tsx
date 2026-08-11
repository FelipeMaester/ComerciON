'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { getQuoteFlowStatus } from '@/lib/quoteStatus';
import type { AddressType, Customer, Quote, Sale, SaleStatus } from '@/lib/types';

interface CustomerHistory {
  customer: { id: string; name: string };
  quotes: Quote[];
  sales: Sale[];
  outstandingBalance: number;
  overdueBalance: number;
}

const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  QUOTE: 'Orçamento',
  CONFIRMED: 'Confirmada',
  CANCELED: 'Cancelada',
  RETURNED: 'Devolvida',
};

const SALE_STATUS_COLOR: Record<SaleStatus, string> = {
  QUOTE: 'text-amber-600 dark:text-amber-400',
  CONFIRMED: 'text-emerald-600 dark:text-emerald-400',
  CANCELED: 'text-slate-400 dark:text-slate-500',
  RETURNED: 'text-red-600 dark:text-red-400',
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);

  async function load() {
    try {
      const data = await api.get<Customer>(`/customers/${params.id}`);
      setCustomer(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o cliente.');
    }
  }

  async function loadHistory() {
    try {
      const data = await api.get<CustomerHistory>(`/customers/${params.id}/history`);
      setHistory(data);
    } catch {
      // Histórico é complementar — se falhar, o resto da página continua usável.
    }
  }

  useEffect(() => {
    load();
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function toggleActive() {
    if (!customer) return;
    const action = customer.isActive ? 'deactivate' : 'activate';
    await api.patch(`/customers/${customer.id}/${action}`);
    load();
  }

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!customer) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>;

  return (
    <div>
      <button onClick={() => router.push('/customers')} className="mb-4 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
        ← Voltar
      </button>

      <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{customer.name}</h1>
            {customer.creditLimit && history && history.outstandingBalance > Number(customer.creditLimit) && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                Limite de fiado excedido
              </span>
            )}
          </div>
          <button onClick={toggleActive} className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
            {customer.isActive ? 'Desativar' : 'Ativar'}
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-4">
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Tipo</dt>
            <dd>{customer.type === 'INDIVIDUAL' ? 'Pessoa física' : 'Pessoa jurídica'}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Documento</dt>
            <dd>{customer.document ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Segmento</dt>
            <dd>{customer.segment}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">E-mail</dt>
            <dd>{customer.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Telefone</dt>
            <dd>{customer.phone ?? '—'}</dd>
          </div>
        </dl>

        <FiadoSettingsSection customer={customer} history={history} onChanged={load} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium">Endereços</h2>
        <button
          onClick={() => setShowAddressForm((v) => !v)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          {showAddressForm ? 'Cancelar' : 'Adicionar endereço'}
        </button>
      </div>

      {showAddressForm && (
        <AddAddressForm
          customerId={customer.id}
          onCreated={() => {
            setShowAddressForm(false);
            load();
          }}
        />
      )}

      <ul className="space-y-2">
        {customer.addresses?.map((addr) => (
          <li key={addr.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm">
            <span className="mr-2 rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-500 dark:text-slate-400">
              {addr.type === 'SHIPPING' ? 'Entrega' : 'Cobrança'}
            </span>
            {addr.isDefault && <span className="mr-2 text-xs text-emerald-600 dark:text-emerald-400">padrão</span>}
            {addr.street}, {addr.number ?? 's/n'} — {addr.city}/{addr.state} — {addr.zipCode}
          </li>
        ))}
        {(!customer.addresses || customer.addresses.length === 0) && (
          <p className="text-sm text-slate-400 dark:text-slate-500">Nenhum endereço cadastrado.</p>
        )}
      </ul>

      <div className="mb-3 mt-6 flex items-center justify-between">
        <h2 className="text-lg font-medium">Veículos</h2>
        <button
          onClick={() => setShowVehicleForm((v) => !v)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          {showVehicleForm ? 'Cancelar' : 'Adicionar veículo'}
        </button>
      </div>

      {showVehicleForm && (
        <AddVehicleForm
          customerId={customer.id}
          onCreated={() => {
            setShowVehicleForm(false);
            load();
          }}
        />
      )}

      <ul className="space-y-2">
        {customer.vehicles?.map((vehicle) => (
          <li
            key={vehicle.id}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm"
          >
            <Link href={`/vehicles/${vehicle.id}`} className="mr-2 font-mono hover:underline">
              {vehicle.plate}
            </Link>
            <span className="text-slate-500 dark:text-slate-400">
              {[vehicle.brand, vehicle.model, vehicle.year, vehicle.color].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
        {(!customer.vehicles || customer.vehicles.length === 0) && (
          <p className="text-sm text-slate-400 dark:text-slate-500">Nenhum veículo cadastrado.</p>
        )}
      </ul>

      <h2 className="mb-3 mt-6 text-lg font-medium">Histórico de serviços</h2>
      <ul className="mb-6 space-y-2">
        {history?.quotes.map((quote) => {
          const flowStatus = getQuoteFlowStatus(quote);
          return (
            <li key={quote.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-slate-400 dark:text-slate-500">{new Date(quote.createdAt).toLocaleString('pt-BR')}</span>
                <span className={`text-xs font-medium ${flowStatus.colorClass}`}>{flowStatus.label}</span>
              </div>
              <Link href={`/quotes/${quote.id}`} className="text-slate-900 dark:text-slate-100 hover:underline">
                {quote.description || 'Orçamento sem descrição'}
              </Link>
              {quote.vehicle && 'plate' in quote.vehicle && (
                <span className="ml-2 font-mono text-xs text-slate-400 dark:text-slate-500">{quote.vehicle.plate}</span>
              )}
              <span className="ml-2 text-slate-500 dark:text-slate-400">R$ {Number(quote.total).toFixed(2)}</span>
            </li>
          );
        })}
        {history && history.quotes.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">Nenhum serviço/orçamento para este cliente ainda.</p>
        )}
        {!history && <p className="text-sm text-slate-400 dark:text-slate-500">Carregando histórico…</p>}
      </ul>

      <h2 className="mb-3 text-lg font-medium">Histórico de compras</h2>
      <ul className="space-y-2">
        {history?.sales.map((sale) => (
          <li key={sale.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-slate-400 dark:text-slate-500">{new Date(sale.createdAt).toLocaleString('pt-BR')}</span>
              <span className={`text-xs font-medium ${SALE_STATUS_COLOR[sale.status]}`}>{SALE_STATUS_LABEL[sale.status]}</span>
            </div>
            <Link href={`/sales/${sale.id}`} className="text-slate-900 dark:text-slate-100 hover:underline">
              {sale.items.length} item(ns)
            </Link>
            <span className="ml-2 text-slate-500 dark:text-slate-400">R$ {Number(sale.total).toFixed(2)}</span>
          </li>
        ))}
        {history && history.sales.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">Nenhuma compra direta (fora de orçamento) para este cliente ainda.</p>
        )}
      </ul>
    </div>
  );
}

function AddAddressForm({ customerId, onCreated }: { customerId: string; onCreated: () => void }) {
  const [type, setType] = useState<AddressType>('SHIPPING');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(`/customers/${customerId}/addresses`, {
        type,
        street,
        number: number || undefined,
        city,
        state,
        zipCode,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível adicionar o endereço.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:grid-cols-3"
    >
      <select className="input" value={type} onChange={(e) => setType(e.target.value as AddressType)}>
        <option value="SHIPPING">Entrega</option>
        <option value="BILLING">Cobrança</option>
      </select>
      <input
        className="input sm:col-span-2"
        placeholder="Rua"
        value={street}
        onChange={(e) => setStreet(e.target.value)}
        required
      />
      <input className="input" placeholder="Número" value={number} onChange={(e) => setNumber(e.target.value)} />
      <input className="input" placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} required />
      <input
        className="input"
        placeholder="UF"
        maxLength={2}
        value={state}
        onChange={(e) => setState(e.target.value.toUpperCase())}
        required
      />
      <input
        className="input"
        placeholder="CEP"
        value={zipCode}
        onChange={(e) => setZipCode(e.target.value)}
        required
      />

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar endereço'}
        </button>
      </div>
    </form>
  );
}

function FiadoSettingsSection({
  customer,
  history,
  onChanged,
}: {
  customer: Customer;
  history: CustomerHistory | null;
  onChanged: () => void;
}) {
  const [days, setDays] = useState(customer.paymentTermDays != null ? String(customer.paymentTermDays) : '');
  const [limit, setLimit] = useState(customer.creditLimit != null ? String(customer.creditLimit) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDays(customer.paymentTermDays != null ? String(customer.paymentTermDays) : '');
    setLimit(customer.creditLimit != null ? String(customer.creditLimit) : '');
  }, [customer.paymentTermDays, customer.creditLimit]);

  const currentDays = customer.paymentTermDays != null ? String(customer.paymentTermDays) : '';
  const currentLimit = customer.creditLimit != null ? String(customer.creditLimit) : '';
  const dirty = days !== currentDays || limit !== currentLimit;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/customers/${customer.id}`, {
        paymentTermDays: days ? Number(days) : null,
        creditLimit: limit ? Number(limit) : null,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar as opções de fiado.');
    } finally {
      setSaving(false);
    }
  }

  const limitNum = limit ? Number(limit) : null;
  const overLimit = limitNum != null && !!history && history.outstandingBalance > limitNum;

  return (
    <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
      <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Fiado</p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm text-slate-600 dark:text-slate-300">
          <span className="mb-1 block text-slate-400 dark:text-slate-500">Prazo padrão (dias)</span>
          <input
            className="input w-24"
            type="number"
            min={1}
            max={365}
            step={1}
            placeholder="—"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </label>
        <label className="text-sm text-slate-600 dark:text-slate-300">
          <span className="mb-1 block text-slate-400 dark:text-slate-500">Limite (R$)</span>
          <input
            className="input w-28"
            type="number"
            min={0.01}
            step="0.01"
            placeholder="sem limite"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
        {dirty && (
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        Qualquer cliente pode receber fiado na hora da venda (PDV ou Vendas) — este prazo é só a sugestão pré-preenchida,
        ajustável a cada venda. O limite é só um aviso, não bloqueia a venda.
      </p>

      {history && (
        <p className={`mt-2 text-sm ${overLimit ? 'font-medium text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>
          Saldo em aberto: R$ {history.outstandingBalance.toFixed(2)}
          {history.overdueBalance > 0 && (
            <span className="text-red-600 dark:text-red-400"> (R$ {history.overdueBalance.toFixed(2)} vencido)</span>
          )}
          {limitNum != null && <span> — limite R$ {limitNum.toFixed(2)}</span>}
        </p>
      )}

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function AddVehicleForm({ customerId, onCreated }: { customerId: string; onCreated: () => void }) {
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(`/customers/${customerId}/vehicles`, {
        plate,
        brand: brand || undefined,
        model: model || undefined,
        color: color || undefined,
        year: year ? Number(year) : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível adicionar o veículo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:grid-cols-5"
    >
      <input
        className="input"
        placeholder="Placa*"
        value={plate}
        onChange={(e) => setPlate(e.target.value)}
        required
      />
      <input className="input" placeholder="Marca" value={brand} onChange={(e) => setBrand(e.target.value)} />
      <input className="input" placeholder="Modelo" value={model} onChange={(e) => setModel(e.target.value)} />
      <input className="input" placeholder="Cor" value={color} onChange={(e) => setColor(e.target.value)} />
      <input className="input" type="number" step={1} placeholder="Ano" value={year} onChange={(e) => setYear(e.target.value)} />

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar veículo'}
        </button>
      </div>
    </form>
  );
}
