'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { InvoiceType, Sale, ShipmentStatus } from '@/lib/types';

const STATUS_LABEL: Record<string, string> = {
  QUOTE: 'Orçamento',
  CONFIRMED: 'Confirmada',
  CANCELED: 'Cancelada',
  RETURNED: 'Devolvida',
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Dinheiro',
  DEBIT_CARD: 'Cartão de débito',
  CREDIT_CARD: 'Cartão de crédito',
  PIX: 'PIX',
  BOLETO: 'Boleto',
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  ISSUED: 'Emitida',
  CANCELED: 'Cancelada',
  ERROR: 'Erro',
};

const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Em processamento',
  SHIPPED: 'Enviado',
  IN_TRANSIT: 'Em trânsito',
  DELIVERED: 'Entregue',
  RETURNED: 'Devolvido',
};

const NEXT_SHIPMENT_STATUS: Partial<Record<ShipmentStatus, ShipmentStatus>> = {
  PROCESSING: 'SHIPPED',
  SHIPPED: 'IN_TRANSIT',
  IN_TRANSIT: 'DELIVERED',
};

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [sale, setSale] = useState<Sale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await api.get<Sale>(`/sales/${params.id}`);
      setSale(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a venda.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function runAction(action: 'confirm' | 'cancel' | 'return') {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/sales/${params.id}/${action}`);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível concluir a ação.');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!sale) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>;

  return (
    <div>
      <button onClick={() => router.push('/sales')} className="mb-4 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
        ← Voltar
      </button>

      <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{sale.customer?.name ?? 'Cliente avulso'}</h1>
          <span className="text-sm font-medium">{STATUS_LABEL[sale.status]}</span>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-5">
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Data</dt>
            <dd>{new Date(sale.createdAt).toLocaleString('pt-BR')}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Subtotal</dt>
            <dd>R$ {Number(sale.subtotal).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Desconto</dt>
            <dd>R$ {Number(sale.discount).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Frete</dt>
            <dd>R$ {Number(sale.shippingCost ?? 0).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Total</dt>
            <dd className="font-semibold">R$ {Number(sale.total).toFixed(2)}</dd>
          </div>
        </dl>

        {actionError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{actionError}</p>}

        <div className="mt-4 flex gap-2">
          {sale.status === 'QUOTE' && (
            <>
              <button
                onClick={() => runAction('confirm')}
                disabled={busy}
                className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                Confirmar venda
              </button>
              <button
                onClick={() => runAction('cancel')}
                disabled={busy}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                Cancelar orçamento
              </button>
            </>
          )}
          {sale.status === 'CONFIRMED' && (
            <button
              onClick={() => runAction('return')}
              disabled={busy}
              className="rounded-lg border border-red-300 dark:border-red-800 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
            >
              Registrar devolução
            </button>
          )}
        </div>
      </div>

      <h2 className="mb-3 text-lg font-medium">Itens</h2>
      <table className="mb-6 w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-4 py-2">Produto</th>
            <th className="px-4 py-2">Qtd</th>
            <th className="px-4 py-2">Preço unit.</th>
            <th className="px-4 py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => (
            <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-2">{item.product?.name ?? item.productId}</td>
              <td className="px-4 py-2">{item.quantity}</td>
              <td className="px-4 py-2">R$ {Number(item.unitPrice).toFixed(2)}</td>
              <td className="px-4 py-2">R$ {Number(item.total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-3 text-lg font-medium">Pagamentos</h2>
      <table className="mb-6 w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-4 py-2">Forma</th>
            <th className="px-4 py-2">Parcelas</th>
            <th className="px-4 py-2">Valor</th>
          </tr>
        </thead>
        <tbody>
          {sale.payments.map((p) => (
            <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-2">{PAYMENT_LABEL[p.method]}</td>
              <td className="px-4 py-2">{p.installments}x</td>
              <td className="px-4 py-2">R$ {Number(p.amount).toFixed(2)}</td>
            </tr>
          ))}
          {sale.payments.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-4 text-center text-slate-400 dark:text-slate-500">
                Nenhum pagamento registrado (orçamento).
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {sale.status === 'CONFIRMED' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <InvoiceSection sale={sale} onChanged={load} />
          <ShipmentSection sale={sale} onChanged={load} />
        </div>
      )}
    </div>
  );
}

function InvoiceSection({ sale, onChanged }: { sale: Sale; onChanged: () => void }) {
  const [type, setType] = useState<InvoiceType>('NFCE');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const invoice = sale.invoice;

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/fiscal/invoices/sales/${sale.id}/issue`, { type });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível emitir a nota.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/fiscal/invoices/sales/${sale.id}/cancel`, { reason: cancelReason });
      setShowCancelForm(false);
      setCancelReason('');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível cancelar a nota.');
    } finally {
      setBusy(false);
    }
  }

  async function addCorrection(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/fiscal/invoices/sales/${sale.id}/corrections`, { text: correctionText });
      setShowCorrectionForm(false);
      setCorrectionText('');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível registrar a carta de correção.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <h2 className="mb-3 text-lg font-medium">Nota fiscal</h2>
      <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
        Emissão simulada nesta fase — sem integração real com a SEFAZ (ver README).
      </p>

      {!invoice || invoice.status === 'CANCELED' ? (
        <div className="flex gap-2">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as InvoiceType)}>
            <option value="NFCE">NFC-e (consumidor final)</option>
            <option value="NFE">NF-e (empresa)</option>
          </select>
          <button onClick={issue} disabled={busy} className="btn-primary shrink-0">
            {busy ? 'Emitindo…' : 'Emitir'}
          </button>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Status</span>
            <span className="font-medium">{INVOICE_STATUS_LABEL[invoice.status]}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Tipo</span>
            <span>{invoice.type}</span>
          </div>
          {invoice.accessKey && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Chave de acesso</span>
              <p className="break-all font-mono text-xs">{invoice.accessKey}</p>
            </div>
          )}
          {invoice.status === 'ISSUED' && (
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCorrectionForm((v) => !v)} className="btn-secondary text-xs">
                Carta de correção
              </button>
              <button onClick={() => setShowCancelForm((v) => !v)} className="text-xs text-red-600 dark:text-red-400 hover:underline">
                Cancelar nota
              </button>
            </div>
          )}
        </div>
      )}

      {showCorrectionForm && (
        <form onSubmit={addCorrection} className="mt-3 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          <textarea
            className="input"
            placeholder="Texto da carta de correção (mín. 15 caracteres)"
            value={correctionText}
            onChange={(e) => setCorrectionText(e.target.value)}
            required
          />
          <button type="submit" disabled={busy} className="btn-secondary">
            Registrar correção
          </button>
        </form>
      )}

      {showCancelForm && (
        <form onSubmit={cancel} className="mt-3 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          <textarea
            className="input"
            placeholder="Motivo do cancelamento (mín. 15 caracteres)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            required
          />
          <button type="submit" disabled={busy} className="rounded-lg border border-red-300 dark:border-red-800 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950">
            Confirmar cancelamento
          </button>
        </form>
      )}

      {invoice?.corrections && invoice.corrections.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs text-slate-500 dark:text-slate-400">
          {invoice.corrections.map((c) => (
            <li key={c.id}>
              <span className="text-slate-400 dark:text-slate-500">{new Date(c.createdAt).toLocaleDateString('pt-BR')}:</span> {c.text}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-3">
          <ErrorNotice message={error} />
        </div>
      )}
    </div>
  );
}

function ShipmentSection({ sale, onChanged }: { sale: Sale; onChanged: () => void }) {
  const [carrier, setCarrier] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shipment = sale.shipment;
  const nextStatus = shipment ? NEXT_SHIPMENT_STATUS[shipment.status] : undefined;

  async function createShipment(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/logistics/shipments/sales/${sale.id}`, {
        carrier: carrier || undefined,
        trackingCode: trackingCode || undefined,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o envio.');
    } finally {
      setBusy(false);
    }
  }

  async function advanceStatus() {
    if (!nextStatus) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/logistics/shipments/sales/${sale.id}/status`, { status: nextStatus, note: note || undefined });
      setNote('');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível atualizar o status.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <h2 className="mb-3 text-lg font-medium">Envio</h2>

      {!shipment ? (
        <form onSubmit={createShipment} className="space-y-2">
          <input className="input" placeholder="Transportadora (opcional)" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
          <input
            className="input"
            placeholder="Código de rastreio (opcional)"
            value={trackingCode}
            onChange={(e) => setTrackingCode(e.target.value)}
          />
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Criando…' : 'Criar envio'}
          </button>
        </form>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Status</span>
            <span className="font-medium">{SHIPMENT_STATUS_LABEL[shipment.status]}</span>
          </div>
          {shipment.carrier && (
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Transportadora</span>
              <span>{shipment.carrier}</span>
            </div>
          )}
          {shipment.trackingCode && (
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Rastreio</span>
              <span className="font-mono text-xs">{shipment.trackingCode}</span>
            </div>
          )}

          {nextStatus && (
            <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-2">
              <input className="input" placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button onClick={advanceStatus} disabled={busy} className="btn-secondary">
                {busy ? 'Atualizando…' : `Marcar como "${SHIPMENT_STATUS_LABEL[nextStatus]}"`}
              </button>
            </div>
          )}

          {shipment.events && shipment.events.length > 0 && (
            <ul className="space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2 text-xs text-slate-500 dark:text-slate-400">
              {shipment.events.map((ev) => (
                <li key={ev.id}>
                  <span className="text-slate-400 dark:text-slate-500">{new Date(ev.createdAt).toLocaleString('pt-BR')}:</span>{' '}
                  {SHIPMENT_STATUS_LABEL[ev.status]}
                  {ev.note ? ` — ${ev.note}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3">
          <ErrorNotice message={error} />
        </div>
      )}
    </div>
  );
}
