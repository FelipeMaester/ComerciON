'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { AbcClass, DashboardSummary } from '@/lib/types';

const ABC_LABEL: Record<AbcClass, string> = {
  A: 'A — alto giro',
  B: 'B — giro médio',
  C: 'C — baixo giro',
};

const ABC_COLOR: Record<AbcClass, string> = {
  A: 'bg-emerald-100 text-emerald-700 dark:text-emerald-400',
  B: 'bg-amber-100 text-amber-700',
  C: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardSummary>('/reports/dashboard')
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o dashboard.'));
  }, []);

  if (error) return <ErrorNotice message={error} compact={false} />;
  if (!summary) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>;

  const abcCounts = summary.abcCurve.reduce(
    (acc, item) => {
      acc[item.class] += 1;
      return acc;
    },
    { A: 0, B: 0, C: 0 } as Record<AbcClass, number>,
  );

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Visão geral</h1>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Vendas hoje" value={`R$ ${summary.today.total.toFixed(2)}`} hint={`${summary.today.count} venda(s)`} />
        <SummaryCard label="Vendas no mês" value={`R$ ${summary.month.total.toFixed(2)}`} hint={`${summary.month.count} venda(s)`} />
        <SummaryCard label="Ticket médio (mês)" value={`R$ ${summary.month.averageTicket.toFixed(2)}`} />
        <GoalCard goal={summary.goal} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Oportunidades abertas" value={String(summary.pipeline.openCount)} />
        <SummaryCard label="Valor em oportunidades" value={`R$ ${summary.pipeline.openValue.toFixed(2)}`} />
        <SummaryCard
          label="Oportunidades paradas"
          value={String(summary.pipeline.staleCount)}
          hint="sem troca de etapa há mais de 7 dias"
        />
        <SummaryCard label="Tarefas atrasadas" value={String(summary.tasks.overdueCount)} hint={`${summary.tasks.todayCount} vencendo hoje`} />
      </div>

      {summary.pipeline.staleOpportunities.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-4">
          <h2 className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-300">Oportunidades encontradas</h2>
          <ul className="space-y-1">
            {summary.pipeline.staleOpportunities.map((opp) => (
              <li key={opp.id} className="text-sm text-amber-700 dark:text-amber-400">
                {opp.customer?.name ?? 'Cliente'} — &quot;{opp.title}&quot; parada em {opp.stage && 'name' in opp.stage ? opp.stage.name : 'uma etapa'}.
              </li>
            ))}
          </ul>
          <Link href="/pipeline" className="mt-2 inline-block text-sm font-medium text-amber-800 dark:text-amber-300 underline">
            Ver oportunidades
          </Link>
        </div>
      )}

      {summary.tasks.overdueTasks.length > 0 && (
        <div className="mb-6 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4">
          <h2 className="mb-2 text-sm font-medium text-red-800 dark:text-red-300">Tarefas atrasadas</h2>
          <ul className="space-y-1">
            {summary.tasks.overdueTasks.map((task) => (
              <li key={task.id} className="text-sm text-red-700 dark:text-red-400">
                &quot;{task.title}&quot;{task.customer && ` — ${task.customer.name}`}
                {task.dueDate && ` — venceu em ${new Date(task.dueDate).toLocaleDateString('pt-BR')}`}
              </li>
            ))}
          </ul>
          <Link href="/tasks" className="mt-2 inline-block text-sm font-medium text-red-800 dark:text-red-300 underline">
            Ver tarefas
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-3 text-lg font-medium">Mais vendidos no mês</h2>
          {summary.topProducts.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">Nenhuma venda confirmada este mês ainda.</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-1">Produto</th>
                    <th className="py-1">Qtd</th>
                    <th className="py-1">Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topProducts.map((p) => (
                    <tr key={p.productId} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-2">{p.name}</td>
                      <td className="py-2">{p.quantity}</td>
                      <td className="py-2">R$ {p.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-3 text-lg font-medium">Curva ABC de estoque</h2>
          <div className="mb-3 flex gap-3 text-xs">
            <span className={`rounded px-2 py-1 ${ABC_COLOR.A}`}>{abcCounts.A} produto(s) A</span>
            <span className={`rounded px-2 py-1 ${ABC_COLOR.B}`}>{abcCounts.B} produto(s) B</span>
            <span className={`rounded px-2 py-1 ${ABC_COLOR.C}`}>{abcCounts.C} produto(s) C</span>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-1">Produto</th>
                    <th className="py-1">Faturamento</th>
                    <th className="py-1">Classe</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.abcCurve.map((item) => (
                    <tr key={item.productId} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-2">{item.name}</td>
                      <td className="py-2">R$ {item.revenue.toFixed(2)}</td>
                      <td className="py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${ABC_COLOR[item.class]}`}>{ABC_LABEL[item.class]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</div>}
    </div>
  );
}

function GoalCard({ goal }: { goal: DashboardSummary['goal'] }) {
  if (goal.targetAmount === null) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="text-xs text-slate-500 dark:text-slate-400">Meta do mês</div>
        <div className="mt-1 text-sm text-slate-400 dark:text-slate-500">Nenhuma meta definida.</div>
        <a href="/reports" className="mt-1 inline-block text-xs text-slate-600 dark:text-slate-300 underline">
          Definir em Relatórios
        </a>
      </div>
    );
  }

  const pct = Math.min(100, goal.progressPct ?? 0);
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div className="text-xs text-slate-500 dark:text-slate-400">Meta do mês</div>
      <div className="mt-1 text-2xl font-semibold">{goal.progressPct?.toFixed(0)}%</div>
      <div className="mt-2 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-2 rounded-full bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        R$ {goal.actualAmount.toFixed(2)} de R$ {goal.targetAmount.toFixed(2)}
      </div>
    </div>
  );
}
