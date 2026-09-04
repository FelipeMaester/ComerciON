'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { setTenantSlug } from '@/lib/session';
import { slugDoEndereco } from '@/lib/tenant-do-endereco';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function ForgotPasswordPage() {
  const [tenantSlug, setTenantSlugInput] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Quando o endereço já identifica a loja, não se pergunta de novo.
  const [slugDoDominio, setSlugDoDominio] = useState<string | null>(null);
  const situacaoDoEmail = useSituacaoDoEmail();

  useEffect(() => {
    setSlugDoDominio(slugDoEndereco());
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // O slug precisa ir no header para a API saber em qual empresa procurar.
      setTenantSlug((slugDoDominio ?? tenantSlug).trim());
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
      <div className="card w-full max-w-sm p-8">
        <h1 className="mb-1 titulo-pagina">Esqueci minha senha</h1>

        <AvisoDeEmail situacao={situacaoDoEmail} />

        {sent ? (
          <>
            {/* A confirmação é propositalmente vaga sobre o e-mail existir ou
                não — a API responde igual nos dois casos, e a tela não pode
                contradizer isso.

                Mas "vaga" não é "falsa": quando o servidor não tem como
                mandar e-mail, dizer "enviamos" e "confira o spam" manda a
                pessoa procurar por uma hora algo que nunca saiu. Aí o aviso
                acima já é a resposta, e esta parte se cala. */}
            {situacaoDoEmail === null || situacaoDoEmail === 'enviando' ? (
              <>
                <p className="mb-6 mt-3 text-sm text-suave">
                  Se este e-mail estiver cadastrado nessa empresa, enviamos um link para criar uma nova
                  senha. Confira também a caixa de spam.
                </p>
                <p className="mb-6 text-sm text-suave">O link vale por 1 hora e só pode ser usado uma vez.</p>
              </>
            ) : (
              <p className="mb-6 mt-3 text-sm text-suave">
                O pedido foi registrado, mas não conte com o e-mail: procure o administrador.
              </p>
            )}
            <Link href="/login" className="btn-primary block w-full text-center">
              Voltar para o login
            </Link>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm text-suave">
              {slugDoDominio
                ? 'Informe seu e-mail. Enviaremos um link para você escolher uma nova senha.'
                : 'Informe a empresa e o seu e-mail. Enviaremos um link para você escolher uma nova senha.'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!slugDoDominio && (
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

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Enviando…' : 'Enviar link'}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-suave">
              Lembrou a senha?{' '}
              <Link href="/login" className="text-texto underline">
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
      <span className="mb-1 block text-suave">{label}</span>
      {children}
    </label>
  );
}

/** O que o servidor responde em GET /health/mail. */
type SituacaoDoEmail = 'enviando' | 'nao-configurado' | 'fora-do-ar';

/**
 * Descobre se este servidor consegue mesmo mandar e-mail.
 *
 * A tela responde igual exista o e-mail ou não — de propósito, para não virar
 * uma forma de descobrir quem tem conta na loja. O efeito colateral é que ela
 * também responde igual quando NADA foi enviado: com MAIL_PROVIDER=stub, a
 * instalação recém-feita diz "enviamos um link", manda conferir o spam, e não
 * existe e-mail nenhum para achar.
 *
 * Isso não é o mesmo segredo. Se o servidor manda e-mail ou não é uma
 * característica da INSTALAÇÃO, igual para todo mundo — não revela nada sobre
 * quem tem conta. E é a única informação que tira a pessoa do lugar.
 */
function useSituacaoDoEmail(): SituacaoDoEmail | null {
  const [situacao, setSituacao] = useState<SituacaoDoEmail | null>(null);

  useEffect(() => {
    let vivo = true;
    api
      .get<{ provedor: string }>('/health/mail')
      .then((d) => vivo && setSituacao(d.provedor === 'stub' ? 'nao-configurado' : 'enviando'))
      .catch((err) => {
        // 503 é a resposta do próprio health check quando o SMTP está
        // configurado mas não responde — e-mail configurado e fora do ar é
        // tão impeditivo quanto e-mail nenhum.
        if (vivo && err instanceof ApiError && err.status === 503) setSituacao('fora-do-ar');
        // Qualquer outra falha: silêncio. Enquanto não sabe, não afirma.
      });
    return () => {
      vivo = false;
    };
  }, []);

  return situacao;
}

function AvisoDeEmail({ situacao }: { situacao: SituacaoDoEmail | null }) {
  if (situacao === null || situacao === 'enviando') return null;

  return (
    <p className="mb-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      {situacao === 'nao-configurado'
        ? 'Este sistema ainda não está configurado para enviar e-mail, então o link não vai chegar.'
        : 'O envio de e-mail está fora do ar neste momento, então o link pode não chegar.'}{' '}
      Peça ao administrador da sua empresa para definir uma senha nova em <strong>Usuários</strong>.
    </p>
  );
}
