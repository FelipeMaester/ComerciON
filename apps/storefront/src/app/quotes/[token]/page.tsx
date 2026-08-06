'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import type { PublicQuote, QuoteStatus } from '@/lib/types';

const STATUS_LABEL: Record<QuoteStatus, string> = {
  PENDING: 'Aguardando sua aprovação',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
};

export default function PublicQuotePage() {
  const params = useParams<{ token: string }>();
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await api.get<PublicQuote>(`/storefront/quotes/${params.token}`);
      setQuote(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o orçamento.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token]);

  async function respond(action: 'approve' | 'reject') {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/storefront/quotes/${params.token}/${action}`);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível registrar sua resposta.');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!quote) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
        <p className="text-sm text-slate-400 dark:text-slate-500">Orçamento para</p>
        <h1 className="mb-1 text-2xl font-semibold">{quote.customer.name}</h1>
        {quote.vehicle && (
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            {[quote.vehicle.plate, quote.vehicle.brand, quote.vehicle.model].filter(Boolean).join(' · ')}
          </p>
        )}

        {quote.description && <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{quote.description}</p>}

        <table className="mb-4 w-full text-sm">
          <thead className="text-left text-slate-400 dark:text-slate-500">
            <tr>
              <th className="py-1">Descrição</th>
              <th className="py-1">Qtd</th>
              <th className="py-1">Preço unit.</th>
              <th className="py-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5">{item.description}</td>
                <td className="py-1.5">{item.quantity}</td>
                <td className="py-1.5">R$ {Number(item.unitPrice).toFixed(2)}</td>
                <td className="py-1.5">R$ {(item.quantity * Number(item.unitPrice)).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mb-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
          <span className="text-slate-500 dark:text-slate-400">Total</span>
          <span className="text-xl font-semibold">R$ {Number(quote.total).toFixed(2)}</span>
        </div>

        {quote.status === 'PENDING' ? (
          <div className="flex gap-3">
            <button onClick={() => respond('approve')} disabled={busy} className="btn-primary flex-1">
              {busy ? 'Enviando…' : 'Aprovar orçamento'}
            </button>
            <button
              onClick={() => respond('reject')}
              disabled={busy}
              className="flex-1 rounded-lg border border-red-300 dark:border-red-800 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
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
