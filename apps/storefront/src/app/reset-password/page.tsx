'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';

const MIN_LENGTH = 8;

export default function ResetPasswordPage() {
  // useSearchParams exige limite de Suspense no App Router; sem ele o build
  // de produção falha ao pré-renderizar.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Validado aqui além do servidor: errar a confirmação é o engano mais
    // comum, e não vale gastar uma das tentativas do limite com ele.
    if (password.length < MIN_LENGTH) {
      setError(`A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmation) {
      setError('As duas senhas não são iguais.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/customer-auth/reset-password', { token, newPassword: password });
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível alterar a senha.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <Card title="Link inválido">
        <p className="mb-6 text-sm text-slate-600 dark:text-slate-300">
          Este link está incompleto — costuma acontecer quando ele é copiado pela metade do e-mail.
        </p>
        <Link href="/forgot-password" className="btn-primary block w-full text-center">
          Pedir novo link
        </Link>
      </Card>
    );
  }

  if (done) {
    return (
      <Card title="Senha alterada">
        <p className="mb-6 text-sm text-slate-600 dark:text-slate-300">
          Pronto. Estamos te levando para o login.
        </p>
        <Link href="/login" className="btn-primary block w-full text-center">
          Entrar agora
        </Link>
      </Card>
    );
  }

  return (
    <Card title="Criar nova senha">
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Escolha uma senha com pelo menos {MIN_LENGTH} caracteres.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="input"
          type="password"
          placeholder="Nova senha"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Repita a nova senha"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </form>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-sm">
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8">
        <h1 className="mb-3 text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}
