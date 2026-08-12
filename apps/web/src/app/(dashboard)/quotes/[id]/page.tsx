'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import { getQuoteFlowStatus, isSalePaid } from '@/lib/quoteStatus';
import type { Quote, ServiceOrderStatus } from '@/lib/types';

const SERVICE_ORDER_STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  CANCELED: 'Cancelada',
};

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? 'http://localhost:3002';

/** Converte ISO -> valor aceito pelo <input type="datetime-local"> (sem segundos/timezone). */
function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function QuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [soStatus, setSoStatus] = useState<ServiceOrderStatus>('OPEN');
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduling, setScheduling] = useState(false);

  async function load() {
    try {
      const data = await api.get<Quote>(`/quotes/${params.id}`);
      setQuote(data);
      if (data.serviceOrder) {
        setSoStatus(data.serviceOrder.status);
        setScheduledAt(toDatetimeLocalValue(data.serviceOrder.scheduledAt));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o orçamento.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function runAction(action: 'approve' | 'reject') {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/quotes/${params.id}/${action}`);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível concluir a ação.');
    } finally {
      setBusy(false);
    }
  }

  async function saveSoStatus() {
    if (!quote?.serviceOrder || soStatus === quote.serviceOrder.status) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.patch(`/service-orders/${quote.serviceOrder.id}/status`, { status: soStatus });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o status do serviço.');
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule(clear = false) {
    if (!quote?.serviceOrder) return;
    setScheduling(true);
    setActionError(null);
    try {
      await api.patch(`/service-orders/${quote.serviceOrder.id}/schedule`, {
        scheduledAt: clear || !scheduledAt ? undefined : new Date(scheduledAt).toISOString(),
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível agendar o serviço.');
    } finally {
      setScheduling(false);
    }
  }

  if (error) return <ErrorNotice message={error} />;
  if (!quote) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>;

  const publicLink = `${STOREFRONT_URL}/quotes/${quote.publicToken}`;
  const customerName = quote.customer && 'name' in quote.customer ? quote.customer.name : '—';
  const flowStatus = getQuoteFlowStatus(quote);
  const so = quote.serviceOrder;

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
          <span className={`text-sm font-medium ${flowStatus.colorClass}`}>{flowStatus.label}</span>
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
            <dt className="text-slate-400 dark:text-slate-500">Agendado para</dt>
            <dd>{so?.scheduledAt ? new Date(so.scheduledAt).toLocaleString('pt-BR') : '—'}</dd>
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

            <p className="mb-2 mt-4 border-t border-slate-100 dark:border-slate-800 pt-3 text-sm text-slate-600 dark:text-slate-300">
              Ou registre a resposta do cliente manualmente (ex.: ele avisou por telefone/presencialmente):
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => runAction('approve')}
                disabled={busy}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? 'Processando…' : 'Aprovar manualmente'}
              </button>
              <button
                onClick={() => runAction('reject')}
                disabled={busy}
                className="rounded-lg border border-red-300 dark:border-red-800 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
              >
                Recusar manualmente
              </button>
            </div>
          </div>
        )}

        {so && (
          <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Execução do serviço</p>
              {/* Via em A4 com linha de assinatura — é o papel que o cliente
                  assina autorizando o serviço. */}
              <a
                href={`/print/service-order/${so.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs"
              >
                Imprimir OS
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input max-w-xs" value={soStatus} onChange={(e) => setSoStatus(e.target.value as ServiceOrderStatus)}>
                {Object.entries(SERVICE_ORDER_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button onClick={saveSoStatus} disabled={busy || soStatus === so.status} className="btn-primary shrink-0">
                {busy ? 'Salvando…' : 'Atualizar status'}
              </button>

              <input
                className="input max-w-xs"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <button onClick={() => saveSchedule()} disabled={scheduling || !scheduledAt} className="btn-secondary shrink-0 disabled:opacity-50">
                {scheduling ? 'Salvando…' : 'Agendar'}
              </button>
              {so.scheduledAt && (
                <button
                  onClick={() => saveSchedule(true)}
                  disabled={scheduling}
                  className="text-sm text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                >
                  Remover agendamento
                </button>
              )}
            </div>

            {so.status === 'DONE' && (
              <p className={`mt-3 text-sm ${so.sale && isSalePaid(so.sale) ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                {so.sale ? (
                  isSalePaid(so.sale) ? (
                    <>
                      Pago —{' '}
                      <Link href={`/sales/${so.sale.id}`} className="font-medium underline">
                        ver venda
                      </Link>
                      .
                    </>
                  ) : (
                    <>
                      Venda gerada automaticamente ao concluir o serviço —{' '}
                      <Link href={`/sales/${so.sale.id}`} className="font-medium underline">
                        registre o pagamento na venda
                      </Link>{' '}
                      para dar baixa e finalizar o atendimento.
                    </>
                  )
                ) : (
                  'Serviço concluído.'
                )}
              </p>
            )}
          </div>
        )}

        {actionError && (
          <div className="mt-3">
            <ErrorNotice message={actionError} />
          </div>
        )}
      </div>

      <h2 className="mb-3 text-lg font-medium">Itens</h2>
      <div className="w-full overflow-x-auto">
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
    </div>
  );
}
