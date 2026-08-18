'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoFicha } from '@/components/Carregando';
import { ErrorNotice } from '@/components/ErrorNotice';
import { getQuoteFlowStatus, isSalePaid } from '@/lib/quoteStatus';
import { getTenantSlug } from '@/lib/session';
import type { Quote, ServiceOrderStatus } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

const SERVICE_ORDER_STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  CANCELED: 'Cancelada',
};

// O link de aprovação aponta para o PRÓPRIO painel, numa rota pública fora
// do layout logado (/aprovar). Antes ia para a loja virtual; com ela
// removida, a página veio junto — aprovar orçamento é fluxo de oficina.


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
  if (!quote) return <CarregandoFicha />;

  // Montado a partir da origem atual: funciona em localhost, em rede local e
  // no domínio de produção sem depender de variável de ambiente que alguém
  // esqueceria de atualizar. O slug vai junto porque a página é pública.
  const origem = typeof window === 'undefined' ? '' : window.location.origin;
  const publicLink = `${origem}/aprovar/${quote.publicToken}?loja=${getTenantSlug() ?? ''}`;
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
      <button onClick={() => router.push('/quotes')} className="mb-4 text-sm text-suave hover:text-texto">
        ← Voltar
      </button>

      <div className="card mb-6 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="titulo-pagina">{customerName}</h1>
          <span className={flowStatus.badgeClass}>{flowStatus.label}</span>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm text-suave sm:grid-cols-4">
          <div>
            <dt className="text-tenue">Data</dt>
            <dd>{new Date(quote.createdAt).toLocaleString('pt-BR')}</dd>
          </div>
          <div>
            <dt className="text-tenue">Veículo</dt>
            <dd>{quote.vehicle && 'plate' in quote.vehicle ? quote.vehicle.plate : '—'}</dd>
          </div>
          <div>
            <dt className="text-tenue">Total</dt>
            <dd className="font-semibold">{formatarMoeda(Number(quote.total))}</dd>
          </div>
          <div>
            <dt className="text-tenue">Agendado para</dt>
            <dd>{so?.scheduledAt ? new Date(so.scheduledAt).toLocaleString('pt-BR') : '—'}</dd>
          </div>
        </dl>

        {quote.description && (
          <p className="mt-3 text-sm text-suave">
            <span className="text-tenue">Observações: </span>
            {quote.description}
          </p>
        )}

        {quote.status === 'PENDING' && (
          <div className="card mt-4 p-3">
            <p className="mb-2 text-sm text-suave">
              Envie este link ao cliente (WhatsApp, e-mail…) para que ele aprove ou recuse o orçamento sem precisar de login:
            </p>
            <div className="flex gap-2">
              <input className="input flex-1 font-mono text-xs" readOnly value={publicLink} />
              <button onClick={copyLink} className="btn-secondary shrink-0">
                {copied ? 'Copiado!' : 'Copiar link'}
              </button>
            </div>

            <p className="mb-2 mt-4 border-t border-linha pt-3 text-sm text-suave">
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
          <div className="mt-4 border-t border-linha pt-4">
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
                  className="text-sm text-suave hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
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
        <table className="tabela card">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Qtd</th>
              <th>Preço unit.</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{item.quantity}</td>
                <td>{formatarMoeda(Number(item.unitPrice))}</td>
                <td>{formatarMoeda(item.quantity * Number(item.unitPrice))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
