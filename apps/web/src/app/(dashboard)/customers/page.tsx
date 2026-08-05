'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import type { AddressType, Customer, CustomerType } from '@/lib/types';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');

  async function load(searchTerm?: string) {
    setLoading(true);
    setError(null);
    try {
      const query = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
      const data = await api.get<Customer[]>(`/customers${query}`);
      setCustomers(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os clientes.');
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
        <h1 className="text-xl font-semibold">Clientes</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {showForm ? 'Cancelar' : 'Novo cliente'}
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(search);
        }}
        className="mb-4 flex gap-2"
      >
        <input
          className="input max-w-xs"
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
          Buscar
        </button>
      </form>

      {showForm && (
        <CreateCustomerForm
          onCreated={() => {
            setShowForm(false);
            load(search);
          }}
        />
      )}

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : (
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Documento</th>
              <th className="px-4 py-2">Segmento</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                <td className="px-4 py-2">
                  <Link href={`/customers/${c.id}`} className="text-slate-900 dark:text-slate-100 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{c.type === 'INDIVIDUAL' ? 'Pessoa física' : 'Pessoa jurídica'}</td>
                <td className="px-4 py-2">{c.document ?? '—'}</td>
                <td className="px-4 py-2">{c.segment}</td>
                <td className="px-4 py-2">
                  <span className={c.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}>
                    {c.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateCustomerForm({ onCreated }: { onCreated: () => void }) {
  const [type, setType] = useState<CustomerType>('INDIVIDUAL');
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showAddress, setShowAddress] = useState(false);
  const [addressType, setAddressType] = useState<AddressType>('SHIPPING');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const customer = await api.post<Customer>('/customers', {
        type,
        name,
        document: document || undefined,
        email: email || undefined,
        phone: phone || undefined,
      });

      if (showAddress) {
        try {
          await api.post(`/customers/${customer.id}/addresses`, {
            type: addressType,
            street,
            number: number || undefined,
            city,
            state,
            zipCode,
            isDefault: true,
          });
        } catch (err) {
          // Cliente já foi criado com sucesso — um endereço que falhou não
          // deve escondê-lo nem forçar o usuário a preencher tudo de novo,
          // só avisamos que ele precisa adicionar o endereço manualmente depois.
          setError(
            `Cliente criado, mas não foi possível salvar o endereço: ${
              err instanceof ApiError ? err.message : 'erro desconhecido'
            }`,
          );
          onCreated();
          return;
        }
      }

      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:grid-cols-2"
    >
      <select className="input" value={type} onChange={(e) => setType(e.target.value as CustomerType)}>
        <option value="INDIVIDUAL">Pessoa física</option>
        <option value="COMPANY">Pessoa jurídica</option>
      </select>
      <input className="input" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
      <input
        className="input"
        placeholder="CPF ou CNPJ (opcional)"
        value={document}
        onChange={(e) => setDocument(e.target.value)}
      />
      <input
        className="input"
        type="email"
        placeholder="E-mail (opcional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="input"
        placeholder="Telefone (opcional)"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />

      <div className="col-span-full border-t border-slate-100 pt-3 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setShowAddress((v) => !v)}
          className="text-sm text-slate-600 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
        >
          {showAddress ? '− Não adicionar endereço' : '+ Adicionar endereço'}
        </button>
      </div>

      {showAddress && (
        <>
          <select className="input" value={addressType} onChange={(e) => setAddressType(e.target.value as AddressType)}>
            <option value="SHIPPING">Entrega</option>
            <option value="BILLING">Cobrança</option>
          </select>
          <input
            className="input"
            placeholder="Rua"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            required={showAddress}
          />
          <input className="input" placeholder="Número (opcional)" value={number} onChange={(e) => setNumber(e.target.value)} />
          <input
            className="input"
            placeholder="Cidade"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required={showAddress}
          />
          <input
            className="input"
            placeholder="UF"
            maxLength={2}
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase())}
            required={showAddress}
          />
          <input
            className="input"
            placeholder="CEP"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            required={showAddress}
          />
        </>
      )}

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
