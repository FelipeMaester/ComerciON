'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { TwoFactorSecret, UserProfile } from '@/lib/types';

export default function AccountPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.get<UserProfile>('/auth/me');
      setProfile(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o perfil.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!profile) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>;

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Painel do cliente</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Suas informações de conta e segurança.</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <fieldset className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-200">Meus dados</legend>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-sm text-slate-600 dark:text-slate-300">
              <div>
                <dt className="text-xs text-slate-400 dark:text-slate-500">Nome</dt>
                <dd>{profile.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400 dark:text-slate-500">E-mail</dt>
                <dd>{profile.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400 dark:text-slate-500">Papel</dt>
                <dd>{profile.role}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400 dark:text-slate-500">Empresa</dt>
                <dd>{profile.tenantName}</dd>
              </div>
            </dl>
          </fieldset>

          <ChangePasswordForm />
        </div>

        <TwoFactorPanel enabled={profile.twoFactorEnabled} onChange={load} />
      </div>
    </div>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError('A confirmação não bate com a nova senha.');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/auth/password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível trocar a senha.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
    >
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Trocar senha</p>
      <input
        className="input w-full"
        type="password"
        placeholder="Senha atual"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        required
      />
      <input
        className="input w-full"
        type="password"
        placeholder="Nova senha"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        minLength={8}
        required
      />
      <input
        className="input w-full"
        type="password"
        placeholder="Confirmar nova senha"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        minLength={8}
        required
      />

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Senha atualizada.</p>}

      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? 'Salvando…' : 'Trocar senha'}
      </button>
    </form>
  );
}

function TwoFactorPanel({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  const [secret, setSecret] = useState<TwoFactorSecret | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    setError(null);
    try {
      const data = await api.post<TwoFactorSecret>('/auth/2fa/generate');
      setSecret(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível gerar o secret.');
    }
  }

  async function handleEnable(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/auth/2fa/enable', { code });
      setSecret(null);
      setCode('');
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Código inválido.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/auth/2fa/disable', { code });
      setCode('');
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Código inválido.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset className="h-fit rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <legend className="px-1 text-sm font-medium text-slate-700 dark:text-slate-200">Autenticação de dois fatores</legend>

      {enabled ? (
        <form onSubmit={handleDisable} className="mt-2 space-y-3">
          <p className="text-sm text-emerald-600 dark:text-emerald-400">2FA está habilitado nesta conta.</p>
          <input
            className="input w-full"
            placeholder="Código do app autenticador"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            required
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={saving} className="btn-secondary">
            {saving ? 'Desabilitando…' : 'Desabilitar 2FA'}
          </button>
        </form>
      ) : secret ? (
        <form onSubmit={handleEnable} className="mt-2 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Adicione essa chave no seu app autenticador (Google Authenticator, Authy...):
          </p>
          <code className="block break-all rounded bg-slate-100 p-2 text-xs dark:bg-slate-800">{secret.secret}</code>
          <input
            className="input w-full"
            placeholder="Código de 6 dígitos"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            required
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Confirmando…' : 'Confirmar e habilitar'}
          </button>
        </form>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">2FA está desabilitado nesta conta.</p>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="button" onClick={handleGenerate} className="btn-primary">
            Habilitar 2FA
          </button>
        </div>
      )}
    </fieldset>
  );
}
