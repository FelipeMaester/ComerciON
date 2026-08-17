'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { setTenantSlug } from '@/lib/session';
import type { PublicQuote, QuoteStatus } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

/**
 * Página pública onde o CLIENTE aprova ou recusa o orçamento.
 *
 * Fora de (dashboard) de propósito: quem abre este link não tem conta nem
 * sessão, e não pode ver o menu do painel.
 *
 * Morava na loja virtual. Veio para cá quando a loja foi removida — aprovar
 * orçamento é fluxo de oficina, não de e-commerce; só estava hospedado lá.
 */

const STATUS_LABEL: Record<QuoteStatus, string> = {
  PENDING: 'Aguardando sua aprovação',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
};

export default function PaginaAprovarOrcamento() {
  // useSearchParams exige limite de Suspense no App Router.
  return (
    <main className="min-h-screen px-4 py-10">
      <Suspense fallback={<p className="text-center text-sm text-suave">Carregando…</p>}>
        <Orcamento />
      </Suspense>
    </main>
  );
}

function Orcamento() {
  const token = useParams<{ token: string }>().token;
  // O slug vai na URL porque a página é pública: sem sessão, não há de onde
  // tirar a empresa. O segredo é o token; o slug não é.
  const loja = useSearchParams().get('loja');

  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      if (loja) setTenantSlug(loja);
      setQuote(await api.get<PublicQuote>(`/public/quotes/${token}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o orçamento.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, loja]);

  async function responder(acao: 'approve' | 'reject') {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/public/quotes/${token}/${acao}`, {});
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível registrar sua resposta.');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="card mx-auto max-w-md p-6 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <p className="mt-2 text-xs text-suave">
          Se o link foi copiado do e-mail, confira se veio inteiro.
        </p>
      </div>
    );
  }

  if (!quote) return <p className="text-center text-sm text-suave">Carregando…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card p-6">
        <p className="text-sm text-tenue">Orçamento para</p>
        <h1 className="mb-1 titulo-pagina">{quote.customer.name}</h1>
        {quote.vehicle && (
          <p className="mb-4 text-sm text-suave">
            {[quote.vehicle.plate, quote.vehicle.brand, quote.vehicle.model].filter(Boolean).join(' · ')}
          </p>
        )}

        {quote.description && <p className="mb-4 text-sm text-suave">{quote.description}</p>}

        <div className="w-full overflow-x-auto">
          <table className="mb-4 w-full text-sm">
            <thead className="text-left text-tenue">
              <tr>
                <th className="py-1">Descrição</th>
                <th className="py-1">Qtd</th>
                <th className="py-1">Preço unit.</th>
                <th className="py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-1.5">{item.description}</td>
                  <td className="py-1.5">{item.quantity}</td>
                  <td className="py-1.5">{formatarMoeda(Number(item.unitPrice))}</td>
                  <td className="py-1.5">{formatarMoeda(item.quantity * Number(item.unitPrice))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-4 flex items-center justify-between border-t border-linha pt-3">
          <span className="text-suave">Total</span>
          <span className="text-xl font-semibold">{formatarMoeda(Number(quote.total))}</span>
        </div>

        {quote.status === 'PENDING' ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={() => responder('approve')} disabled={busy} className="btn-primary flex-1">
              {busy ? 'Enviando…' : 'Aprovar orçamento'}
            </button>
            <button
              onClick={() => responder('reject')}
              disabled={busy}
              className="flex-1 rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            >
              Recusar
            </button>
          </div>
        ) : (
          <p
            className={`rounded-lg p-3 text-center text-sm font-medium ${
              quote.status === 'APPROVED'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'
            }`}
          >
            {STATUS_LABEL[quote.status]}
            {quote.status === 'APPROVED' && ' — a ordem de serviço já foi gerada.'}
          </p>
        )}

        {actionError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{actionError}</p>}
      </div>
    </div>
  );
}
