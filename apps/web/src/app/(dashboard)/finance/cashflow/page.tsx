'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import type { CashFlowSummary } from '@/lib/types';

function firstDayOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function lastDayOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

export default function CashFlowPage() {
  const router = useRouter();
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(lastDayOfMonth());
  const [summary, setSummary] = useState<CashFlowSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<CashFlowSummary>(`/finance/cashflow?from=${from}&to=${to}`);
      setSummary(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o fluxo de caixa.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <button onClick={() => router.push('/finance')} className="mb-4 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
        ← Voltar
      </button>

      <h1 className="mb-4 text-xl font-semibold">Fluxo de caixa</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="mb-6 flex flex-wrap items-end gap-3"
      >
        <label className="text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">De</span>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">Até</span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
          Atualizar
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : summary ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SummaryCard title="Previsto (por vencimento)" data={summary.previsto} />
          <SummaryCard title="Realizado (por pagamento)" data={summary.realizado} />
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ title, data }: { title: string; data: { receitas: number; despesas: number; saldo: number } }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <h2 className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">{title}</h2>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500 dark:text-slate-400">Receitas</dt>
          <dd className="text-emerald-600 dark:text-emerald-400">R$ {data.receitas.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500 dark:text-slate-400">Despesas</dt>
          <dd className="text-red-600 dark:text-red-400">R$ {data.despesas.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-2 font-semibold">
          <dt>Saldo</dt>
          <dd className={data.saldo >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700'}>R$ {data.saldo.toFixed(2)}</dd>
        </div>
      </dl>
    </div>
  );
}
