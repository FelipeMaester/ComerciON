'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import { getSaleFlowStatus } from '@/lib/saleStatus';
import type { InvoiceType, PaymentMethod, Sale, ShipmentStatus } from '@/lib/types';

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

  async function runAction(action: 'cancel' | 'return') {
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

  const paidSoFar = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Math.round((Number(sale.total) - paidSoFar) * 100) / 100;
  const flowStatus = getSaleFlowStatus(sale);

  return (
    <div>
      <button onClick={() => router.push('/sales')} className="mb-4 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
        ← Voltar
      </button>

      <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{sale.customer?.name ?? 'Cliente avulso'}</h1>
          <span className={`text-sm font-medium ${flowStatus.colorClass}`}>{flowStatus.label}</span>
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

        {sale.status === 'CONFIRMED' && (
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => runAction('return')}
              disabled={busy}
              className="rounded-lg border border-red-300 dark:border-red-800 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
            >
              Registrar devolução
            </button>
          </div>
        )}

        {sale.status === 'QUOTE' && (
          <ConfirmSaleSection
            sale={sale}
            onConfirmed={load}
            onCancel={() => runAction('cancel')}
            busy={busy}
          />
        )}
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
              <td className="px-4 py-2">{item.description ?? item.product?.name ?? item.productId}</td>
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
                {sale.status === 'QUOTE' ? 'Nenhum pagamento registrado (orçamento).' : 'Nenhum pagamento registrado — pendente.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {sale.status === 'CONFIRMED' && remaining > 0 && (
        <div className="mb-6">
          <PaymentSection sale={sale} remaining={remaining} onChanged={load} />
        </div>
      )}

      {sale.status === 'CONFIRMED' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <InvoiceSection sale={sale} onChanged={load} />
          <ShipmentSection sale={sale} onChanged={load} />
        </div>
      )}
    </div>
  );
}

type ConfirmPaymentMethod = PaymentMethod | 'FIADO';

interface ConfirmPaymentLine {
  method: ConfirmPaymentMethod;
  installments: number;
  amount: number;
  days?: number;
}

function ConfirmSaleSection({
  sale,
  onConfirmed,
  onCancel,
  busy,
}: {
  sale: Sale;
  onConfirmed: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const total = Number(sale.total);
  const alreadyPaid = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const dueNow = Math.max(0, Math.round((total - alreadyPaid) * 100) / 100);

  // Fiado exige um cliente identificado — qualquer cliente cadastrado serve.
  const canFiado = !!sale.customerId;
  const [payments, setPayments] = useState<ConfirmPaymentLine[]>([{ method: 'CASH', installments: 1, amount: dueNow }]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paymentsSum = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const paymentsMatch = Math.abs(paymentsSum - dueNow) < 0.01;
  const remaining = Math.max(0, Math.round((dueNow - paymentsSum) * 100) / 100);
  const fiadoLine = payments.find((p) => p.method === 'FIADO');

  function updatePayment(index: number, patch: Partial<ConfirmPaymentLine>) {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }
  function addPaymentLine() {
    setPayments((prev) => [...prev, { method: 'CASH', installments: 1, amount: 0 }]);
  }
  function removePaymentLine(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  }

  async function confirm() {
    if (!paymentsMatch) {
      setError(
        canFiado
          ? 'A soma precisa fechar com o valor pendente — use a forma "Fiado" para o que ficará pendente.'
          : 'A soma dos pagamentos precisa ser igual ao valor pendente.',
      );
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const realPayments = payments.filter((p) => p.method !== 'FIADO' && p.amount > 0);
      await api.post(`/sales/${sale.id}/confirm`, {
        payments: realPayments.length > 0 ? realPayments.map((p) => ({ method: p.method as PaymentMethod, installments: p.installments, amount: p.amount })) : undefined,
        fiadoDays: fiadoLine?.days,
      });
      onConfirmed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível confirmar a venda.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
      <p className="mb-2 text-sm font-medium">Confirmar venda</p>
      {canFiado && (
        <p className="mb-2 text-xs text-blue-600 dark:text-blue-400">
          Use a forma &quot;Fiado&quot; para deixar parte (ou tudo) pendente, com prazo ajustável.
        </p>
      )}

      <div className="space-y-2">
        {payments.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              className="input max-w-xs"
              value={p.method}
              onChange={(e) => {
                const method = e.target.value as ConfirmPaymentMethod;
                if (method === 'FIADO') {
                  updatePayment(i, { method, amount: remaining + Number(p.amount || 0), days: sale.customer?.paymentTermDays ?? 30 });
                } else {
                  updatePayment(i, { method });
                }
              }}
            >
              <option value="CASH">Dinheiro</option>
              <option value="DEBIT_CARD">Cartão de débito</option>
              <option value="CREDIT_CARD">Cartão de crédito</option>
              <option value="PIX">PIX</option>
              <option value="BOLETO">Boleto</option>
              {canFiado && <option value="FIADO">Fiado</option>}
            </select>
            {p.method === 'CREDIT_CARD' && (
              <input
                className="input w-20"
                type="number"
                min={1}
                step={1}
                placeholder="Parcelas"
                value={p.installments}
                onChange={(e) => updatePayment(i, { installments: Math.max(1, Number(e.target.value)) })}
              />
            )}
            {p.method === 'FIADO' && (
              <input
                className="input w-20"
                type="number"
                min={1}
                max={365}
                step={1}
                placeholder="Dias"
                value={p.days ?? sale.customer?.paymentTermDays ?? 30}
                onChange={(e) => updatePayment(i, { days: Math.max(1, Math.min(365, Number(e.target.value))) })}
              />
            )}
            <input
              className="input w-28"
              type="number"
              min={0}
              step="0.01"
              value={p.amount}
              onChange={(e) => updatePayment(i, { amount: Number(e.target.value) })}
            />
            {payments.length > 1 && (
              <button onClick={() => removePaymentLine(i)} className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400">
                ×
              </button>
            )}
          </div>
        ))}
        <button onClick={addPaymentLine} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
          + adicionar forma
        </button>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          onClick={confirm}
          disabled={confirming || busy}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {confirming ? 'Confirmando…' : 'Confirmar venda'}
        </button>
        <button
          onClick={onCancel}
          disabled={confirming || busy}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          Cancelar orçamento
        </button>
      </div>

      <p className={`mt-2 text-xs ${paymentsMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
        Pagamentos: R$ {paymentsSum.toFixed(2)} de R$ {dueNow.toFixed(2)}{' '}
        {paymentsMatch ? '✓ confere' : `(faltam R$ ${remaining.toFixed(2)})`}
      </p>
      {fiadoLine && fiadoLine.amount > 0 && (
        <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
          R$ {Number(fiadoLine.amount).toFixed(2)} ficam como fiado, vencendo em {fiadoLine.days ?? sale.customer?.paymentTermDays} dias.
        </p>
      )}
      {!canFiado && !paymentsMatch && (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Venda avulsa (sem cliente) não pode ficar fiado — o pagamento precisa cobrir o total.
        </p>
      )}
      {error && (
        <div className="mt-2">
          <ErrorNotice message={error} />
        </div>
      )}
    </div>
  );
}

function PaymentSection({ sale, remaining, onChanged }: { sale: Sale; remaining: number; onChanged: () => void }) {
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [installments, setInstallments] = useState(1);
  const [amount, setAmount] = useState(remaining);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function registerPayment(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/sales/${sale.id}/payments`, { method, installments, amount });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível registrar o pagamento.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <h2 className="mb-1 text-lg font-medium">Registrar pagamento</h2>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        Saldo pendente: <span className="font-semibold">R$ {remaining.toFixed(2)}</span>
      </p>
      <form onSubmit={registerPayment} className="flex flex-wrap items-end gap-2">
        <select className="input max-w-xs" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          <option value="CASH">Dinheiro</option>
          <option value="DEBIT_CARD">Cartão de débito</option>
          <option value="CREDIT_CARD">Cartão de crédito</option>
          <option value="PIX">PIX</option>
          <option value="BOLETO">Boleto</option>
        </select>
        {method === 'CREDIT_CARD' && (
          <input
            className="input w-24"
            type="number"
            min={1}
            step={1}
            placeholder="Parcelas"
            value={installments}
            onChange={(e) => setInstallments(Math.max(1, Number(e.target.value)))}
          />
        )}
        <input
          className="input w-32"
          type="number"
          min={0.01}
          max={remaining}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button type="submit" disabled={busy} className="btn-primary shrink-0">
          {busy ? 'Registrando…' : 'Registrar pagamento'}
        </button>
      </form>
      {error && (
        <div className="mt-3">
          <ErrorNotice message={error} />
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
