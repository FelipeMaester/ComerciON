'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import type { AddressType, Customer } from '@/lib/types';

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
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

  useEffect(() => {
    load();
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
          <h1 className="text-xl font-semibold">{customer.name}</h1>
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
            <span className="mr-2 font-mono">{vehicle.plate}</span>
            <span className="text-slate-500 dark:text-slate-400">
              {[vehicle.brand, vehicle.model, vehicle.year, vehicle.color].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
        {(!customer.vehicles || customer.vehicles.length === 0) && (
          <p className="text-sm text-slate-400 dark:text-slate-500">Nenhum veículo cadastrado.</p>
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
