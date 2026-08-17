'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import { PageHeader } from '@/components/PageHeader';
import type { AbcClass, DashboardSummary } from '@/lib/types';
import { formatarMoeda, formatarNumero } from '@/lib/format';

const ABC_LABEL: Record<AbcClass, string> = {
  A: 'A — alto giro',
  B: 'B — giro médio',
  C: 'C — baixo giro',
};

const ABC_BADGE: Record<AbcClass, string> = {
  A: 'badge badge-ok',
  B: 'badge badge-alerta',
  C: 'badge badge-neutro',
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
  if (!summary) return <Esqueleto />;

  const abcCounts = summary.abcCurve.reduce(
    (acc, item) => {
      acc[item.class] += 1;
      return acc;
    },
    { A: 0, B: 0, C: 0 } as Record<AbcClass, number>,
  );

  return (
    <div>
      <PageHeader title="Visão geral" subtitle="Como a loja está hoje e no mês." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Vendas hoje"
          value={formatarMoeda(summary.today.total)}
          hint={`${formatarNumero(summary.today.count)} venda(s)`}
          destaque
        />
        <SummaryCard
          label="Vendas no mês"
          value={formatarMoeda(summary.month.total)}
          hint={`${formatarNumero(summary.month.count)} venda(s)`}
        />
        <SummaryCard label="Ticket médio (mês)" value={formatarMoeda(summary.month.averageTicket)} />
        <GoalCard goal={summary.goal} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Oportunidades abertas" value={formatarNumero(summary.pipeline.openCount)} />
        <SummaryCard label="Valor em oportunidades" value={formatarMoeda(summary.pipeline.openValue)} />
        <SummaryCard
          label="Oportunidades paradas"
          value={formatarNumero(summary.pipeline.staleCount)}
          hint="sem troca de etapa há mais de 7 dias"
          alerta={summary.pipeline.staleCount > 0}
        />
        <SummaryCard
          label="Tarefas atrasadas"
          value={formatarNumero(summary.tasks.overdueCount)}
          hint={`${formatarNumero(summary.tasks.todayCount)} vencendo hoje`}
          alerta={summary.tasks.overdueCount > 0}
        />
      </div>

      {summary.pipeline.staleOpportunities.length > 0 && (
        <Aviso
          tom="amber"
          titulo="Oportunidades paradas"
          acao={{ href: '/pipeline', texto: 'Ver oportunidades' }}
          itens={summary.pipeline.staleOpportunities.map((opp) => (
            <span key={opp.id}>
              {opp.customer?.name ?? 'Cliente'} — &quot;{opp.title}&quot; parada em{' '}
              {opp.stage && 'name' in opp.stage ? opp.stage.name : 'uma etapa'}.
            </span>
          ))}
        />
      )}

      {summary.tasks.overdueTasks.length > 0 && (
        <Aviso
          tom="red"
          titulo="Tarefas atrasadas"
          acao={{ href: '/tasks', texto: 'Ver tarefas' }}
          itens={summary.tasks.overdueTasks.map((task) => (
            <span key={task.id}>
              &quot;{task.title}&quot;{task.customer && ` — ${task.customer.name}`}
              {task.dueDate && ` — venceu em ${new Date(task.dueDate).toLocaleDateString('pt-BR')}`}
            </span>
          ))}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="card-titulo">
            <h2 className="titulo-secao">Mais vendidos no mês</h2>
            <Link href="/reports" className="text-xs text-suave transition hover:text-marca">
              Relatórios
            </Link>
          </div>
          {summary.topProducts.length === 0 ? (
            <p className="p-4 text-sm text-tenue">Nenhuma venda confirmada este mês ainda.</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="num">Qtd</th>
                    <th className="num">Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.topProducts.map((p) => (
                    <tr key={p.productId}>
                      <td>{p.name}</td>
                      <td className="num">{formatarNumero(p.quantity)}</td>
                      <td className="num font-medium">{formatarMoeda(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-titulo">
            <h2 className="titulo-secao">Curva ABC de estoque</h2>
            <div className="flex gap-1.5">
              <span className={ABC_BADGE.A}>{abcCounts.A} A</span>
              <span className={ABC_BADGE.B}>{abcCounts.B} B</span>
              <span className={ABC_BADGE.C}>{abcCounts.C} C</span>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <div className="w-full overflow-x-auto">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="num">Faturamento</th>
                    <th>Classe</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.abcCurve.map((item) => (
                    <tr key={item.productId}>
                      <td>{item.name}</td>
                      <td className="num">{formatarMoeda(item.revenue)}</td>
                      <td>
                        <span className={ABC_BADGE[item.class]}>{ABC_LABEL[item.class]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Cartão de número. `destaque` engrossa o valor principal do dia — numa fileira
 * de oito números iguais, nenhum é o primeiro que o olho encontra.
 */
function SummaryCard({
  label,
  value,
  hint,
  destaque,
  alerta,
}: {
  label: string;
  value: string;
  hint?: string;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-suave">{label}</div>
      <div
        className={`mt-1.5 font-semibold tabular-nums tracking-tight ${destaque ? 'text-[28px]' : 'text-2xl'} ${
          alerta ? 'text-amber-600 dark:text-amber-400' : ''
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-tenue">{hint}</div>}
    </div>
  );
}

function GoalCard({ goal }: { goal: DashboardSummary['goal'] }) {
  if (goal.targetAmount === null) {
    return (
      <div className="card p-4">
        <div className="text-xs font-medium text-suave">Meta do mês</div>
        <div className="mt-1.5 text-sm text-tenue">Nenhuma meta definida.</div>
        <Link href="/reports" className="link mt-1 inline-block text-xs">
          Definir em Relatórios
        </Link>
      </div>
    );
  }

  const pct = Math.min(100, goal.progressPct ?? 0);
  const bateu = (goal.progressPct ?? 0) >= 100;
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-suave">Meta do mês</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${bateu ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
        {goal.progressPct?.toFixed(0)}%
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-realce">
        <div
          className={`h-full rounded-full transition-all ${bateu ? 'bg-emerald-500' : 'bg-marca'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 text-xs text-tenue">
        {formatarMoeda(goal.actualAmount)} de {formatarMoeda(goal.targetAmount)}
      </div>
    </div>
  );
}

/** Bloco de atenção (parado, atrasado). Cor forte só aqui, para não virar ruído. */
function Aviso({
  tom,
  titulo,
  itens,
  acao,
}: {
  tom: 'amber' | 'red';
  titulo: string;
  itens: React.ReactNode[];
  acao: { href: string; texto: string };
}) {
  const cores =
    tom === 'amber'
      ? 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
      : 'border-red-300/60 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200';

  return (
    <div className={`mb-6 rounded-xl border p-4 ${cores}`}>
      <h2 className="mb-2 text-sm font-semibold">{titulo}</h2>
      <ul className="space-y-1 text-sm opacity-90">
        {itens.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <Link href={acao.href} className="mt-2.5 inline-block text-sm font-medium underline underline-offset-2">
        {acao.texto}
      </Link>
    </div>
  );
}

/** Enquanto os números não chegam, a tela já tem a forma que vai ter. */
function Esqueleto() {
  return (
    <div>
      <PageHeader title="Visão geral" subtitle="Como a loja está hoje e no mês." />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card space-y-2 p-4">
            <div className="esqueleto h-3 w-24" />
            <div className="esqueleto h-7 w-32" />
            <div className="esqueleto h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card space-y-3 p-4">
            <div className="esqueleto h-4 w-40" />
            {Array.from({ length: 4 }).map((__, j) => (
              <div key={j} className="esqueleto h-5 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
