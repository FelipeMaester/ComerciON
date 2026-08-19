'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoFicha } from '@/components/Carregando';
import { cardFeeAmount as computeCardFeeAmount, grossUpForCardFee } from '@/lib/cardFee';
import { ErrorNotice } from '@/components/ErrorNotice';
import { getSaleFlowStatus } from '@/lib/saleStatus';
import { calcularPrazo, corDoPrazo } from '@/lib/prazo';
import type { InvoiceType, PaymentMethod, Sale, TenantSettings } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

const INSTALLMENT_COUNTS = Array.from({ length: 12 }, (_, i) => i + 1);

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
  if (!sale) return <CarregandoFicha />;

  const paidSoFar = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Math.round((Number(sale.total) - paidSoFar) * 100) / 100;
  const flowStatus = getSaleFlowStatus(sale);

  return (
    <div>
      <button onClick={() => router.push('/sales')} className="mb-4 text-sm text-suave hover:text-texto">
        ← Voltar
      </button>

      <div className="card mb-6 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h1 className="titulo-pagina">{sale.customer?.name ?? 'Cliente avulso'}</h1>
          <div className="flex items-center gap-3">
            {/* Nova aba: o balconista imprime e volta para a venda sem perder
                o lugar. A janela de impressão abre sozinha lá. */}
            <a href={`/print/sale/${sale.id}`} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">
              Imprimir cupom
            </a>
            <span className={flowStatus.badgeClass}>{flowStatus.label}</span>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm text-suave sm:grid-cols-6">
          <div>
            <dt className="text-tenue">Data</dt>
            <dd>{new Date(sale.createdAt).toLocaleString('pt-BR')}</dd>
          </div>
          <div>
            <dt className="text-tenue">Subtotal</dt>
            <dd>{formatarMoeda(Number(sale.subtotal))}</dd>
          </div>
          <div>
            <dt className="text-tenue">Desconto</dt>
            <dd>{formatarMoeda(Number(sale.discount))}</dd>
          </div>
          <div>
            <dt className="text-tenue">Frete</dt>
            <dd>{formatarMoeda(Number(sale.shippingCost ?? 0))}</dd>
          </div>
          <div>
            <dt className="text-tenue">Taxa cartão</dt>
            <dd>{formatarMoeda(Number(sale.cardFeeAmount ?? 0))}</dd>
          </div>
          <div>
            <dt className="text-tenue">Total</dt>
            <dd className="font-semibold">{formatarMoeda(Number(sale.total))}</dd>
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
      <div className="w-full overflow-x-auto">
        <table className="tabela card mb-6">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Qtd</th>
              <th>Preço unit.</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td>{item.description ?? item.product?.name ?? item.productId}</td>
                <td>{item.quantity}</td>
                <td>{formatarMoeda(Number(item.unitPrice))}</td>
                <td>{formatarMoeda(Number(item.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-lg font-medium">Pagamentos</h2>
      <div className="w-full overflow-x-auto">
        <table className="tabela card mb-6">
          <thead>
            <tr>
              <th>Forma</th>
              <th>Parcelas</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {sale.payments.map((p) => (
              <tr key={p.id}>
                <td>{PAYMENT_LABEL[p.method]}</td>
                <td>{p.installments}x</td>
                <td>{formatarMoeda(Number(p.amount))}</td>
              </tr>
            ))}
            {sale.payments.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-4 text-center text-tenue">
                  {sale.status === 'QUOTE' ? 'Nenhum pagamento registrado (orçamento).' : 'Nenhum pagamento registrado — pendente.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EmAberto sale={sale} />

      {sale.status === 'CONFIRMED' && remaining > 0 && (
        <div className="mb-6">
          <PaymentSection sale={sale} remaining={remaining} onChanged={load} />
        </div>
      )}

      {sale.status === 'CONFIRMED' && (
        <div className="grid grid-cols-1 gap-6">
          <InvoiceSection sale={sale} onChanged={load} />
        </div>
      )}
    </div>
  );
}

type ConfirmPaymentMethod = PaymentMethod | 'FIADO';

interface ConfirmPaymentLine {
  method: ConfirmPaymentMethod;
  installments: number;
  // Cartão de crédito: `amount` guarda o valor BASE — o valor cobrado (com o
  // repasse da taxa) é derivado via cardFeePercent, ver grossAmount() abaixo.
  amount: number;
  days?: number;
  cardFeePercent?: number;
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
  const [cardFeeRates, setCardFeeRates] = useState<number[]>(Array(12).fill(0));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TenantSettings>('/settings')
      .then((data) => setCardFeeRates(data.cardFeeRates && data.cardFeeRates.length === 12 ? data.cardFeeRates : Array(12).fill(0)))
      .catch(() => undefined);
  }, []);

  // Cartão de crédito: `p.amount` é o valor base, o valor cobrado (com a
  // taxa repassada) é derivado daqui.
  function grossAmount(p: ConfirmPaymentLine): number {
    if (p.method !== 'CREDIT_CARD') return Number(p.amount || 0);
    return grossUpForCardFee(Number(p.amount || 0), p.cardFeePercent ?? 0);
  }

  const totalCardFee = payments
    .filter((p) => p.method === 'CREDIT_CARD')
    .reduce((sum, p) => sum + computeCardFeeAmount(Number(p.amount || 0), p.cardFeePercent ?? 0), 0);
  const dueWithCardFee = Math.round((dueNow + totalCardFee) * 100) / 100;

  const paymentsSum = payments.reduce((sum, p) => sum + grossAmount(p), 0);
  const paymentsMatch = Math.abs(paymentsSum - dueWithCardFee) < 0.01;
  const remaining = Math.max(0, Math.round((dueWithCardFee - paymentsSum) * 100) / 100);
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
        payments: realPayments.length > 0 ? realPayments.map((p) => ({ method: p.method as PaymentMethod, installments: p.installments, amount: grossAmount(p) })) : undefined,
        fiadoDays: fiadoLine?.days,
        cardFeeAmount: totalCardFee > 0 ? totalCardFee : undefined,
      });
      onConfirmed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível confirmar a venda.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="mt-4 border-t border-linha pt-4">
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
                } else if (method === 'CREDIT_CARD') {
                  const installments = p.installments || 1;
                  updatePayment(i, {
                    method,
                    installments,
                    amount: remaining + grossAmount(p),
                    cardFeePercent: cardFeeRates[installments - 1] ?? 0,
                  });
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
              <select
                className="input w-20"
                value={p.installments}
                onChange={(e) => {
                  const installments = Number(e.target.value);
                  updatePayment(i, { installments, cardFeePercent: cardFeeRates[installments - 1] ?? 0 });
                }}
              >
                {INSTALLMENT_COUNTS.map((n) => (
                  <option key={n} value={n}>
                    {n}x
                  </option>
                ))}
              </select>
            )}
            {p.method === 'CREDIT_CARD' && (
              <input
                className="input w-16"
                type="number"
                min={0}
                max={100}
                step="0.01"
                title="Taxa da maquininha (%)"
                placeholder="Taxa %"
                value={p.cardFeePercent ?? 0}
                onChange={(e) => updatePayment(i, { cardFeePercent: Number(e.target.value) })}
              />
            )}
            {p.method === 'BOLETO' && (
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
              title={p.method === 'CREDIT_CARD' ? 'Valor base (sem a taxa) — o valor cobrado no cartão é calculado ao lado' : undefined}
              value={p.amount}
              onChange={(e) => updatePayment(i, { amount: Number(e.target.value) })}
            />
            {payments.length > 1 && (
              <button onClick={() => removePaymentLine(i)} className="text-tenue hover:text-red-600 dark:hover:text-red-400">
                ×
              </button>
            )}
          </div>
        ))}
        <button onClick={addPaymentLine} className="text-xs text-suave hover:text-texto">
          + adicionar forma
        </button>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          onClick={confirm}
          disabled={confirming || busy}
          className="btn-primary"
        >
          {confirming ? 'Confirmando…' : 'Confirmar venda'}
        </button>
        <button
          onClick={onCancel}
          disabled={confirming || busy}
          className="btn-secondary disabled:opacity-50"
        >
          Cancelar orçamento
        </button>
      </div>

      <p className={`mt-2 text-xs ${paymentsMatch ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
        Pagamentos: {formatarMoeda(paymentsSum)} de {formatarMoeda(dueWithCardFee)}{' '}
        {paymentsMatch ? '✓ confere' : `(faltam ${formatarMoeda(remaining)})`}
      </p>
      {fiadoLine && fiadoLine.amount > 0 && (
        <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
          {formatarMoeda(Number(fiadoLine.amount))} ficam como fiado, vencendo em {fiadoLine.days ?? sale.customer?.paymentTermDays} dias.
        </p>
      )}
      {payments
        .filter((p) => p.method === 'CREDIT_CARD' && p.amount > 0)
        .map((p, i) => (
          <p key={i} className="mt-1 text-xs text-blue-600 dark:text-blue-400">
            {p.installments}x no cartão: {formatarMoeda(grossAmount(p))} cobrado ({formatarMoeda(computeCardFeeAmount(Number(p.amount), p.cardFeePercent ?? 0))}{' '}
            de taxa repassada, {(p.cardFeePercent ?? 0).toFixed(2)}%).
          </p>
        ))}
      {!canFiado && !paymentsMatch && (
        <p className="mt-1 text-xs text-tenue">
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
    <div className="card p-4">
      <h2 className="mb-1 text-lg font-medium">Registrar pagamento</h2>
      <p className="mb-3 text-sm text-suave">
        Saldo pendente: <span className="font-semibold">{formatarMoeda(remaining)}</span>
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
    <div className="card p-4">
      <h2 className="mb-3 text-lg font-medium">Nota fiscal</h2>
      <p className="mb-3 text-xs text-tenue">
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
            <span className="text-suave">Status</span>
            <span className="font-medium">{INVOICE_STATUS_LABEL[invoice.status]}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-suave">Tipo</span>
            <span>{invoice.type}</span>
          </div>
          {invoice.accessKey && (
            <div>
              <span className="text-suave">Chave de acesso</span>
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
        <form onSubmit={addCorrection} className="mt-3 space-y-2 border-t border-linha pt-3">
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
        <form onSubmit={cancel} className="mt-3 space-y-2 border-t border-linha pt-3">
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
        <ul className="mt-3 space-y-1 border-t border-linha pt-3 text-xs text-suave">
          {invoice.corrections.map((c) => (
            <li key={c.id}>
              <span className="text-tenue">{new Date(c.createdAt).toLocaleDateString('pt-BR')}:</span> {c.text}
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

/**
 * O que a venda deixou em aberto — o fiado, com prazo e não só com data.
 *
 * A tela dizia "Pagamento pendente" e parava aí: nem quanto, nem para quando.
 * Quem atende no balcão precisa responder "vence dia 18, faltam 3 dias" ao
 * cliente que está na frente dele, sem abrir o Financeiro e procurar a linha
 * certa no meio das de todo mundo.
 *
 * Some quando não há nada em aberto: bloco vazio dizendo "nenhuma pendência"
 * em toda venda paga é ruído em 90% das telas.
 */
function EmAberto({ sale }: { sale: Sale }) {
  const emAberto = (sale.financialEntries ?? []).filter(
    (e) => e.type === 'RECEIVABLE' && (e.status === 'PENDING' || e.status === 'OVERDUE'),
  );
  if (emAberto.length === 0) return null;

  const total = emAberto.reduce((soma, e) => soma + Number(e.amount), 0);

  return (
    <section className="card mb-6 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">Em aberto</h2>
        <span className="text-sm text-suave">
          {formatarMoeda(total)} a receber em {emAberto.length} {emAberto.length === 1 ? 'conta' : 'contas'}
        </span>
      </div>

      <ul className="mt-3 divide-y divide-linha">
        {emAberto.map((entrada) => {
          const prazo = calcularPrazo(entrada.dueDate);
          return (
            <li key={entrada.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="min-w-0">
                <span className="block text-sm text-texto">
                  {entrada.category === 'Fiado' ? 'Fiado' : entrada.description}
                </span>
                <span className="block text-xs text-tenue">
                  vence {new Date(entrada.dueDate).toLocaleDateString('pt-BR')}
                </span>
              </span>
              <span className="flex items-center gap-3">
                {/* O prazo em palavras é o que responde a pergunta do cliente
                    sem ninguém contar dias no calendário. */}
                <span className={`text-sm font-medium ${corDoPrazo(prazo)}`}>{prazo.texto}</span>
                <span className="text-sm font-semibold tabular-nums text-texto">
                  {formatarMoeda(Number(entrada.amount))}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {emAberto.some((e) => calcularPrazo(e.dueDate).proximo || calcularPrazo(e.dueDate).vencido) && (
        <p className="mt-3 text-xs text-tenue">
          O sistema avisa no sino quando faltarem 3 dias — e pode mandar o lembrete por WhatsApp automaticamente
          (Automações → &quot;Conta a receber vencendo em X dias&quot;).
        </p>
      )}
    </section>
  );
}
