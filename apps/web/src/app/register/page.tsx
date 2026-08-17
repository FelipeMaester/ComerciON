'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { setCurrentUserRole, setTenantSlug } from '@/lib/session';
import { ThemeToggle } from '@/components/ThemeToggle';
import { formatarMoeda } from '@/lib/format';

interface Plan {
  key: string;
  name: string;
  priceMonthly: string;
  modules: string[];
}

export default function RegisterPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlugInput] = useState('');
  const [tenantDocument, setTenantDocument] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [planKey, setPlanKey] = useState('trial');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get<Plan[]>('/billing/plans')
      .then(setPlans)
      .catch(() => {
        // Sem planos carregados, mantém o padrão "trial" — a criação de conta ainda funciona.
      });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.post<{
        tenant: { slug: string };
        user: { role: string };
      }>('/auth/register-tenant', {
        tenantName,
        tenantSlug,
        tenantDocument: tenantDocument || undefined,
        adminName,
        adminEmail,
        adminPassword,
        planKey,
      });
      setTenantSlug(result.tenant.slug);
      setCurrentUserRole(result.user.role);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar a conta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="card w-full max-w-lg p-8">
        <h1 className="mb-1 titulo-pagina">Criar sua conta</h1>
        <p className="mb-6 text-sm text-suave">Cadastre sua empresa e comece a usar agora.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nome da empresa">
            <input className="input" value={tenantName} onChange={(e) => setTenantName(e.target.value)} required />
          </Field>
          <Field label="Identificador (usado para entrar depois)">
            <input
              className="input"
              placeholder="ex: autopecas-silva"
              value={tenantSlug}
              onChange={(e) => setTenantSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              required
            />
          </Field>
          <Field label="CNPJ (opcional)">
            <input className="input" value={tenantDocument} onChange={(e) => setTenantDocument(e.target.value)} />
          </Field>
          <Field label="Seu nome">
            <input className="input" value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
          </Field>
          <Field label="Seu e-mail">
            <input className="input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
          </Field>
          <Field label="Senha">
            <input className="input" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} required />
          </Field>

          {plans.length > 0 && (
            <div>
              <span className="mb-2 block text-sm text-suave">Plano</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {plans.map((plan) => (
                  <label
                    key={plan.key}
                    className={`cursor-pointer rounded-lg border p-3 text-sm ${
                      planKey === plan.key
                        ? 'border-marca bg-marca/5'
                        : 'card'
                    }`}
                  >
                    <input
                      type="radio"
                      name="plan"
                      className="sr-only"
                      checked={planKey === plan.key}
                      onChange={() => setPlanKey(plan.key)}
                    />
                    <div className="font-medium capitalize">{plan.name}</div>
                    <div className="text-suave">
                      {Number(plan.priceMonthly) === 0 ? 'Grátis' : `${formatarMoeda(Number(plan.priceMonthly))}/mês`}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Criando…' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-suave">
          Já tem conta?{' '}
          <Link href="/login" className="text-texto underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
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
