'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Icone } from '@/components/Icone';
import { PageHeader } from '@/components/PageHeader';
import { GraficoArea, GraficoBarras, GraficoRosca, Minigrafico, type PontoSerie } from '@/components/graficos';
import type { AbcClass, DashboardSummary } from '@/lib/types';
import {
  diaCurto,
  diaPorExtenso,
  formaDePagamento,
  formatarMoeda,
  formatarMoedaCurta,
  formatarNumero,
} from '@/lib/format';

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

/** Janelas do gráfico. 30 é o que a API manda; as menores são recortes dela. */
const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 15, rotulo: '15 dias' },
  { dias: 30, rotulo: '30 dias' },
] as const;

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dias, setDias] = useState<number>(30);

  useEffect(() => {
    api
      .get<DashboardSummary>('/reports/dashboard')
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o dashboard.'));
  }, []);

  // O recorte é feito aqui, no cliente: a série de 30 dias já veio inteira, e
  // trocar de 7 para 30 dias sem ida ao servidor é instantâneo.
  const serie: PontoSerie[] = useMemo(() => {
    if (!summary) return [];
    return summary.series.slice(-dias).map((ponto) => ({
      rotulo: diaCurto(ponto.day),
      descricao: diaPorExtenso(ponto.day),
      valor: ponto.total,
      detalhe: ponto.count === 0 ? 'nenhuma venda' : `${formatarNumero(ponto.count)} venda(s)`,
    }));
  }, [summary, dias]);

  if (error) return <ErrorNotice message={error} compact={false} />;
  if (!summary) return <Esqueleto />;

  const abcCounts = summary.abcCurve.reduce(
    (acc, item) => {
      acc[item.class] += 1;
      return acc;
    },
    { A: 0, B: 0, C: 0 } as Record<AbcClass, number>,
  );

  const ultimosSete = summary.series.slice(-7).map((p) => p.total);
  const faturamentoNoPeriodo = serie.reduce((soma, p) => soma + p.valor, 0);

  return (
    <div>
      <PageHeader title="Visão geral" subtitle="Como a loja está hoje e no mês." />

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          rotulo="Vendas hoje"
          valor={formatarMoeda(summary.today.total)}
          nota={`${formatarNumero(summary.today.count)} venda(s)`}
          variacao={summary.trend.todayPct}
          comparadoA="ontem"
          serie={ultimosSete}
          destaque
        />
        <Indicador
          rotulo="Vendas no mês"
          valor={formatarMoeda(summary.month.total)}
          nota={`${formatarNumero(summary.month.count)} venda(s)`}
          variacao={summary.trend.monthPct}
          comparadoA="mês passado"
        />
        <Indicador
          rotulo="Ticket médio (mês)"
          valor={formatarMoeda(summary.month.averageTicket)}
          variacao={summary.trend.ticketPct}
          comparadoA="mês passado"
        />
        <CartaoDeMeta goal={summary.goal} />
      </div>

      <section className="card mb-5">
        <div className="card-titulo">
          <div>
            <h2 className="titulo-secao">Faturamento por dia</h2>
            <p className="text-xs text-tenue">
              {formatarMoeda(faturamentoNoPeriodo)} nos últimos {dias} dias
            </p>
          </div>
          <div className="flex gap-1">
            {PERIODOS.map((periodo) => (
              <button
                key={periodo.dias}
                onClick={() => setDias(periodo.dias)}
                className={`chip ${dias === periodo.dias ? 'chip-ativo' : ''}`}
              >
                {periodo.rotulo}
              </button>
            ))}
          </div>
        </div>
        <div className="p-2 pt-4 sm:p-4">
          {faturamentoNoPeriodo === 0 ? (
            <div className="estado-vazio">
              <Icone nome="vendas" />
              <p>Nenhuma venda confirmada nos últimos {dias} dias.</p>
              <Link href="/pos" className="btn-secondary btn-sm mt-1">
                Abrir o PDV
              </Link>
            </div>
          ) : (
            <GraficoArea dados={serie} formatar={formatarMoedaCurta} formatarDetalhe={formatarMoeda} altura={260} />
          )}
        </div>
      </section>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Oportunidades abertas" valor={formatarNumero(summary.pipeline.openCount)} />
        <Indicador rotulo="Valor em oportunidades" valor={formatarMoeda(summary.pipeline.openValue)} />
        <Indicador
          rotulo="Oportunidades paradas"
          valor={formatarNumero(summary.pipeline.staleCount)}
          nota="sem troca de etapa há mais de 7 dias"
          alerta={summary.pipeline.staleCount > 0}
        />
        <Indicador
          rotulo="Tarefas atrasadas"
          valor={formatarNumero(summary.tasks.overdueCount)}
          nota={`${formatarNumero(summary.tasks.todayCount)} vencendo hoje`}
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

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="card-titulo">
            <h2 className="titulo-secao">Mais vendidos no mês</h2>
            <Link href="/reports" className="text-xs text-suave transition hover:text-marca-legivel">
              Relatórios
            </Link>
          </div>
          <div className="p-4">
            {summary.topProducts.length === 0 ? (
              <div className="estado-vazio">
                <Icone nome="produto" />
                <p>Nenhuma venda confirmada este mês ainda.</p>
              </div>
            ) : (
              <GraficoBarras
                dados={summary.topProducts.map((p) => ({
                  id: p.productId,
                  rotulo: p.name,
                  valor: p.total,
                  detalhe: `${formatarNumero(p.quantity)} un`,
                }))}
                formatar={formatarMoeda}
              />
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-titulo">
            <h2 className="titulo-secao">Como o cliente pagou (mês)</h2>
          </div>
          <div className="p-4">
            {summary.paymentMix.length === 0 ? (
              <div className="estado-vazio">
                <Icone nome="financeiro" />
                <p>Nenhum pagamento registrado este mês.</p>
              </div>
            ) : (
              <GraficoRosca
                dados={summary.paymentMix.map((f) => ({
                  id: f.method,
                  rotulo: formaDePagamento(f.method),
                  valor: f.total,
                }))}
                formatar={formatarMoedaCurta}
                legendaCentro="Recebido"
              />
            )}
          </div>
        </section>
      </div>

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
  );
}

/**
 * Cartão de número.
 *
 * A variação contra o período anterior é o que transforma o número em
 * informação: "R$ 600,00" não diz se o dia está bom; "R$ 600,00, +12% que
 * ontem" diz. Quando não há base de comparação (loja nova, mês zerado), a API
 * manda `null` e o cartão simplesmente não mostra nada — melhor que um "+100%"
 * inventado em cima de uma base zero.
 */
function Indicador({
  rotulo,
  valor,
  nota,
  variacao,
  comparadoA,
  serie,
  destaque,
  alerta,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  variacao?: number | null;
  comparadoA?: string;
  serie?: number[];
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <div className={`card card-interativo p-4 ${destaque ? 'card-destaque' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-suave">{rotulo}</div>
          <div
            className={`mt-1.5 font-semibold tabular-nums tracking-tight ${destaque ? 'text-[28px] leading-9' : 'text-2xl'} ${
              alerta ? 'text-amber-600 dark:text-amber-400' : ''
            }`}
          >
            {valor}
          </div>
        </div>
        {serie && serie.length > 1 && (
          <div className="shrink-0 pt-1">
            <Minigrafico valores={serie} tom={variacao != null && variacao < 0 ? 'baixa' : 'marca'} />
          </div>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        {variacao != null && <Variacao pct={variacao} comparadoA={comparadoA} />}
        {nota && <span className="text-tenue">{nota}</span>}
      </div>
    </div>
  );
}

function Variacao({ pct, comparadoA }: { pct: number; comparadoA?: string }) {
  const subiu = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${
        subiu ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
        <path strokeLinecap="round" strokeLinejoin="round" d={subiu ? 'M12 19V5m0 0l-6 6m6-6l6 6' : 'M12 5v14m0 0l6-6m-6 6l-6-6'} />
      </svg>
      {subiu ? '+' : ''}
      {pct.toFixed(0)}%{comparadoA && <span className="font-normal text-tenue"> vs {comparadoA}</span>}
    </span>
  );
}

function CartaoDeMeta({ goal }: { goal: DashboardSummary['goal'] }) {
  if (goal.targetAmount === null) {
    return (
      <div className="card card-interativo p-4">
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
    <div className="card card-interativo p-4">
      <div className="text-xs font-medium text-suave">Meta do mês</div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${bateu ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
        {goal.progressPct?.toFixed(0)}%
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-realce">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-saida ${
            bateu ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-marca to-marca-forte'
          }`}
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
    <div className={`mb-5 rounded-xl border p-4 ${cores}`}>
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

/**
 * Enquanto os números não chegam, a tela já tem a forma que vai ter.
 *
 * O `role="status"` é o mesmo dos esqueletos das outras telas: além de contar
 * a um leitor de tela que a página está carregando, é o sinal que o teste de
 * renovação de sessão espera desaparecer para saber que a chamada à API
 * terminou de verdade.
 */
function Esqueleto() {
  return (
    <div role="status" aria-label="Carregando a visão geral">
      <PageHeader title="Visão geral" subtitle="Como a loja está hoje e no mês." />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card space-y-2 p-4">
            <div className="esqueleto h-3 w-24" />
            <div className="esqueleto h-7 w-32" />
            <div className="esqueleto h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="card mb-5 space-y-3 p-4">
        <div className="esqueleto h-4 w-40" />
        <div className="esqueleto h-[260px] w-full" />
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
