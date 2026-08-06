'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { Quote, QuoteStatus } from '@/lib/types';

const STATUS_LABEL: Record<QuoteStatus, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
};

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? 'http://localhost:3002';

export default function QuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const data = await api.get<Quote>(`/quotes/${params.id}`);
      setQuote(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o orçamento.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) return <ErrorNotice message={error} />;
  if (!quote) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>;

  const publicLink = `${STOREFRONT_URL}/quotes/${quote.publicToken}`;
  const customerName = quote.customer && 'name' in quote.customer ? quote.customer.name : '—';

  async function copyLink() {
    await navigator.clipboard.writeText(publicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <button onClick={() => router.push('/quotes')} className="mb-4 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
        ← Voltar
      </button>

      <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{customerName}</h1>
          <span className="text-sm font-medium">{STATUS_LABEL[quote.status]}</span>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-4">
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Data</dt>
            <dd>{new Date(quote.createdAt).toLocaleString('pt-BR')}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Veículo</dt>
            <dd>{quote.vehicle && 'plate' in quote.vehicle ? quote.vehicle.plate : '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Total</dt>
            <dd className="font-semibold">R$ {Number(quote.total).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Ordem de serviço</dt>
            <dd>
              {quote.serviceOrder ? (
                <Link href={`/service-orders/${quote.serviceOrder.id}`} className="text-slate-900 dark:text-slate-100 hover:underline">
                  Ver ordem
                </Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>

        {quote.description && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            <span className="text-slate-400 dark:text-slate-500">Observações: </span>
            {quote.description}
          </p>
        )}

        {quote.status === 'PENDING' && (
          <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
              Envie este link ao cliente (WhatsApp, e-mail…) para que ele aprove ou recuse o orçamento sem precisar de login:
            </p>
            <div className="flex gap-2">
              <input className="input flex-1 font-mono text-xs" readOnly value={publicLink} />
              <button onClick={copyLink} className="btn-secondary shrink-0">
                {copied ? 'Copiado!' : 'Copiar link'}
              </button>
            </div>
          </div>
        )}
      </div>

      <h2 className="mb-3 text-lg font-medium">Itens</h2>
      <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-4 py-2">Descrição</th>
            <th className="px-4 py-2">Qtd</th>
            <th className="px-4 py-2">Preço unit.</th>
            <th className="px-4 py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((item) => (
            <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-2">{item.description}</td>
              <td className="px-4 py-2">{item.quantity}</td>
              <td className="px-4 py-2">R$ {Number(item.unitPrice).toFixed(2)}</td>
              <td className="px-4 py-2">R$ {(item.quantity * Number(item.unitPrice)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
