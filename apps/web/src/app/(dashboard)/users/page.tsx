'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { AppUser, UserRole } from '@/lib/types';

const ROLES: UserRole[] = ['ADMIN', 'SALES', 'FINANCE', 'INVENTORY', 'SUPPORT'];

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<AppUser[]>('/users');
      setUsers(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os usuários.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(user: AppUser) {
    const action = user.isActive ? 'deactivate' : 'activate';
    await api.patch(`/users/${user.id}/${action}`);
    load();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Usuários</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {showForm ? 'Cancelar' : 'Novo usuário'}
        </button>
      </div>

      {showForm && (
        <CreateUserForm
          onCreated={() => {
            setShowForm(false);
            load();
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
              <th className="px-4 py-2">E-mail</th>
              <th className="px-4 py-2">Papel</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2">{user.name}</td>
                <td className="px-4 py-2">{user.email}</td>
                <td className="px-4 py-2">{user.role}</td>
                <td className="px-4 py-2">
                  <span className={user.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}>
                    {user.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => toggleActive(user)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
                    {user.isActive ? 'Desativar' : 'Ativar'}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('SALES');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/users', { name, email, password, role });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o usuário.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:grid-cols-2">
      <input className="input" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
      <input
        className="input"
        type="email"
        placeholder="E-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        className="input"
        type="password"
        placeholder="Senha provisória"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <select className="input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
