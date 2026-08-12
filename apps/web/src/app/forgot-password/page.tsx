'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { setTenantSlug } from '@/lib/session';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function ForgotPasswordPage() {
  const [tenantSlug, setTenantSlugInput] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // O slug precisa ir no header para a API saber em qual empresa procurar.
      setTenantSlug(tenantSlug.trim());
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o e-mail. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="mb-1 text-xl font-semibold">Esqueci minha senha</h1>

        {sent ? (
          <>
            {/* A confirmação é propositalmente vaga sobre o e-mail existir ou
                não — a API responde igual nos dois casos, e a tela não pode
                contradizer isso. */}
            <p className="mb-6 mt-3 text-sm text-slate-600 dark:text-slate-300">
              Se este e-mail estiver cadastrado nessa empresa, enviamos um link para criar uma nova senha.
              Confira também a caixa de spam.
            </p>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              O link vale por 1 hora e só pode ser usado uma vez.
            </p>
            <Link href="/login" className="btn-primary block w-full text-center">
              Voltar para o login
            </Link>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
              Informe a empresa e o seu e-mail. Enviaremos um link para você escolher uma nova senha.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Empresa (identificador)">
                <input
                  className="input"
                  placeholder="ex: autopecas-silva"
                  value={tenantSlug}
                  onChange={(e) => setTenantSlugInput(e.target.value)}
                  required
                />
              </Field>
              <Field label="E-mail">
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Enviando…' : 'Enviar link'}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
              Lembrou a senha?{' '}
              <Link href="/login" className="text-slate-900 underline dark:text-slate-100">
                Voltar para o login
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}
