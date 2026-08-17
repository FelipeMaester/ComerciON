'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { setTenantSlug } from '@/lib/session';
import { ThemeToggle } from '@/components/ThemeToggle';

const MIN_LENGTH = 8;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const tenant = searchParams.get('tenant') ?? '';

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const linkIncompleto = !token || !tenant;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Validado aqui além de no servidor: errar a confirmação é o engano mais
    // comum, e não vale gastar uma das tentativas do limite por causa dele.
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
      setTenantSlug(tenant);
      await api.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível alterar a senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (linkIncompleto) {
    return (
      <Card title="Link inválido">
        <p className="mb-6 text-sm text-suave">
          Este link está incompleto. Isso costuma acontecer quando ele é copiado pela metade do e-mail.
          Peça um novo link.
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
        <p className="mb-6 text-sm text-suave">
          Pronto. Você já pode entrar com a nova senha — estamos te levando para o login.
        </p>
        <Link href="/login" className="btn-primary block w-full text-center">
          Ir para o login agora
        </Link>
      </Card>
    );
  }

  return (
    <Card title="Criar nova senha">
      <p className="mb-6 text-sm text-suave">
        Escolha uma senha com pelo menos {MIN_LENGTH} caracteres.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nova senha">
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Field label="Repita a nova senha">
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            required
          />
        </Field>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-suave">
        <Link href="/login" className="text-texto underline">
          Voltar para o login
        </Link>
      </p>
    </Card>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams exige um limite de Suspense no App Router; sem ele o build
  // de produção falha ao tentar pré-renderizar esta página.
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Suspense fallback={<Card title="Criar nova senha">Carregando…</Card>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card w-full max-w-sm p-8">
      <h1 className="mb-3 titulo-pagina">{title}</h1>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-suave">{label}</span>
      {children}
    </label>
  );
}
