'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { lerPreferencias } from '@/lib/preferencias';
import { setCurrentUserRole, setTenantSlug } from '@/lib/session';
import { slugDoEndereco } from '@/lib/tenant-do-endereco';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function LoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlugInput] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Quando a loja vem do endereço (oficina.painel.minhaloja.com.br), não faz
  // sentido pedir para a pessoa digitar o que ela já digitou na barra de
  // endereços — e digitar errado ali dá "credenciais inválidas", que manda
  // procurar o problema na senha.
  const [slugDoDominio, setSlugDoDominio] = useState<string | null>(null);

  // Em efeito, e não no estado inicial: o hostname não existe na renderização
  // do servidor, e ler ali daria erro de hidratação.
  useEffect(() => {
    setSlugDoDominio(slugDoEndereco());
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      setTenantSlug((slugDoDominio ?? tenantSlug).trim());
      // A sessão em si volta em cookie httpOnly, invisível daqui. O que se
      // guarda é só o papel do usuário, para o menu saber o que desenhar.
      const result = await api.post<{ user: { role: string } }>('/auth/login', {
        email,
        password,
        twoFactorCode: twoFactorCode || undefined,
      });
      setCurrentUserRole(result.user.role);

      // O super admin da plataforma vai para a tela dele, e não para a visão
      // geral da loja. Não é preferência: ele não TEM acesso aos dados de
      // nenhuma loja — quatorze controladores o excluem de propósito, porque
      // quem cuida da plataforma não precisa ver a venda de ninguém. Mandá-lo
      // para o painel o deixava numa tela vazia com "Forbidden resource"
      // escrito no meio, que era o primeiro contato dele com o sistema.
      if (result.user.role === 'SUPER_ADMIN') {
        router.push('/admin/tenants');
        return;
      }

      // Para todo o resto, a tela que abre é escolha de quem entra (Minha conta
      // → Aparência): quem usa o sistema para vender não quer passar pela visão
      // geral todo dia. Se o plano não liberar a tela escolhida, o próprio gate
      // redireciona.
      router.push(lerPreferencias().telaInicial);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Dois halos da cor da marca. É o que separa "formulário solto numa
          página branca" de uma tela de entrada — sem imagem para baixar. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-marca/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-32 h-[28rem] w-[28rem] rounded-full bg-marca/10 blur-3xl"
      />

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="card relative w-full max-w-sm p-8 shadow-flutuante">
        <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-marca-solida text-lg font-semibold text-marca-texto">
          C
        </span>
        <h1 className="mb-1 titulo-pagina">ComerciON</h1>
        <p className="mb-6 text-sm text-suave">Entre com as credenciais da sua empresa.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {slugDoDominio ? (
            <p className="rounded-lg bg-realce px-3 py-2 text-sm text-suave">
              Entrando em <span className="font-medium text-texto">{slugDoDominio}</span>
            </p>
          ) : (
            <Field label="Empresa (identificador)">
              <input
                className="input"
                placeholder="ex: autopecas-silva"
                value={tenantSlug}
                onChange={(e) => setTenantSlugInput(e.target.value)}
                required
              />
            </Field>
          )}
          <Field label="E-mail">
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Senha">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Código 2FA (se habilitado)">
            <input
              className="input"
              inputMode="numeric"
              maxLength={6}
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
            />
          </Field>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-suave underline">
            Esqueci minha senha
          </Link>
        </p>

        <p className="mt-2 text-center text-sm text-suave">
          Ainda não tem conta?{' '}
          <Link href="/register" className="text-texto underline">
            Criar conta
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
