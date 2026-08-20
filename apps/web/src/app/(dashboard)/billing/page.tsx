'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { Plan, Subscription, SubscriptionStatus } from '@/lib/types';
import { formatarMoeda, modulo } from '@/lib/format';

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIALING: 'Em teste',
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento pendente',
  CANCELED: 'Cancelada',
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  FAILED: 'Falhou',
};

export default function BillingPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [sub, planList] = await Promise.all([
        api.get<Subscription | null>('/billing/subscription'),
        api.get<Plan[]>('/billing/plans'),
      ]);
      setSubscription(sub);
      setPlans(planList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a assinatura.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function changePlan(planKey: string) {
    setChanging(planKey);
    setError(null);
    try {
      await api.post('/billing/subscribe', { planKey });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível trocar de plano.');
    } finally {
      setChanging(null);
    }
  }

  if (error && !subscription) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;

  return (
    <div>
      <h1 className="mb-6 titulo-pagina">Assinatura</h1>

      {subscription && (
        <div className="card mb-6 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-medium">{subscription.plan.name}</div>
              <div className="text-sm text-suave">{STATUS_LABEL[subscription.status]}</div>
            </div>
            <div className="text-right text-sm text-suave">
              <div>Período atual</div>
              <div>
                {new Date(subscription.currentPeriodStart).toLocaleDateString('pt-BR')} a{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <h2 className="mb-3 text-lg font-medium">Planos disponíveis</h2>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = subscription?.plan.key === plan.key;
          return (
            <div key={plan.key} className={`rounded-lg border p-4 ${isCurrent ? 'card border-marca ring-1 ring-marca' : 'card'}`}>
              <div className="text-base font-medium capitalize">{plan.name}</div>
              <div className="mt-1 text-2xl font-semibold">
                {Number(plan.priceMonthly) === 0 ? 'Grátis' : `${formatarMoeda(Number(plan.priceMonthly))}`}
                {Number(plan.priceMonthly) > 0 && <span className="text-sm font-normal text-suave">/mês</span>}
              </div>
              <ul className="mt-3 space-y-1 text-xs text-suave">
                {plan.modules.map((m) => (
                  <li key={m}>• {modulo(m)}</li>
                ))}
              </ul>
              <button
                onClick={() => changePlan(plan.key)}
                disabled={isCurrent || changing !== null}
                className="btn-secondary mt-4 w-full"
              >
                {isCurrent ? 'Plano atual' : changing === plan.key ? 'Trocando…' : 'Assinar'}
              </button>
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 text-lg font-medium">Faturas</h2>
      <div className="w-full overflow-x-auto">
        <table className="tabela card">
          <thead>
            <tr>
              <th>Período</th>
              <th>Valor</th>
              <th>Situação</th>
              <th>Vencimento</th>
              <th>Paga em</th>
            </tr>
          </thead>
          <tbody>
            {subscription?.invoices?.map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  {new Date(invoice.periodStart).toLocaleDateString('pt-BR')} a{' '}
                  {new Date(invoice.periodEnd).toLocaleDateString('pt-BR')}
                </td>
                <td>{formatarMoeda(Number(invoice.amount))}</td>
                <td>
                  {INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}
                  {/* Cobrança em aberto sem o link seria uma linha na tela sem
                      nenhuma forma de pagar. */}
                  {invoice.status === 'PENDING' && invoice.paymentUrl && (
                    <a
                      href={invoice.paymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 font-medium text-blue-600 underline hover:text-blue-700 dark:text-blue-400"
                    >
                      pagar
                    </a>
                  )}
                </td>
                <td>
                  {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td>{invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString('pt-BR') : '—'}</td>
              </tr>
            ))}
            {(!subscription?.invoices || subscription.invoices.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-tenue">
                  Nenhuma fatura ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
