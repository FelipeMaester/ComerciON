'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { getTokens } from '@/lib/session';
import type { Customer, CustomerAddress } from '@/lib/types';

export default function AccountPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login?redirect=/account');
      return;
    }
    api.get<Customer>('/customer-auth/me').then((data) => {
      setCustomer(data);
      setName(data.name);
      setPhone(data.phone ?? '');
    });
    api.get<CustomerAddress[]>('/storefront/addresses').then(setAddresses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch('/storefront/profile', { name, phone: phone || undefined });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  if (!customer) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Minha conta</h1>

      <div className="mb-6 flex gap-4 text-sm">
        <Link href="/account" className="font-medium text-slate-900 dark:text-slate-100">
          Perfil
        </Link>
        <Link href="/account/orders" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
          Meus pedidos
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-2 text-lg font-medium">Dados pessoais</h2>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" required />
          <input className="input" value={customer.email ?? ''} disabled />
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone" />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Salvando…' : saved ? 'Salvo ✓' : 'Salvar'}
          </button>
        </form>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-2 text-lg font-medium">Endereços</h2>
          <ul className="space-y-2 text-sm">
            {addresses.map((addr) => (
              <li key={addr.id} className="border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                {addr.street}, {addr.number ?? 's/n'} — {addr.city}/{addr.state}
              </li>
            ))}
            {addresses.length === 0 && <p className="text-slate-400 dark:text-slate-500">Nenhum endereço cadastrado ainda.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
