'use client';

import { useState } from 'react';
import { api, downloadFile, ApiError } from '@/lib/api-client';
import { useAviso } from '@/components/Avisos';
import { Botao } from '@/components/Botao';
import { ErrorNotice } from '@/components/ErrorNotice';
import { GraficoBarras } from '@/components/graficos';
import type { PeriodComparison } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Datas de input[type=date] representam o dia inteiro — o backend filtra com "to" exclusivo, então avançamos 1 dia para incluir o dia selecionado. */
function addDay(dateStr: string): string {
  if (!dateStr) return dateStr;
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const avisar = useAviso();
  const [fromA, setFromA] = useState('');
  const [toA, setToA] = useState('');
  const [fromB, setFromB] = useState('');
  const [toB, setToB] = useState('');
  const [comparison, setComparison] = useState<PeriodComparison | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);

  const [goalMonth, setGoalMonth] = useState(currentMonthKey());
  const [goalAmount, setGoalAmount] = useState('');
  const [goalError, setGoalError] = useState<string | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);

  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function compare() {
    setComparing(true);
    setCompareError(null);
    try {
      const params = new URLSearchParams({ fromA, toA: addDay(toA), fromB, toB: addDay(toB) });
      const result = await api.get<PeriodComparison>(`/reports/compare?${params.toString()}`);
      setComparison(result);
    } catch (err) {
      setCompareError(err instanceof ApiError ? err.message : 'Não foi possível comparar os períodos.');
    } finally {
      setComparing(false);
    }
  }

  async function saveGoal() {
    setSavingGoal(true);
    setGoalError(null);
    try {
      await api.put(`/reports/goals/${goalMonth}`, { targetAmount: Number(goalAmount) });
      // Aviso passageiro em vez de texto fixo embaixo do botão: quem salva
      // duas vezes seguidas precisa ver a segunda confirmação acontecer.
      avisar(`Meta de ${formatarMoeda(Number(goalAmount))} salva.`);
    } catch (err) {
      setGoalError(err instanceof ApiError ? err.message : 'Não foi possível salvar a meta.');
    } finally {
      setSavingGoal(false);
    }
  }

  async function exportReport(format: 'csv' | 'pdf') {
    setExporting(format);
    setExportError(null);
    try {
      const params = new URLSearchParams({ from: exportFrom, to: addDay(exportTo), format });
      await downloadFile(`/reports/sales/export?${params.toString()}`, `vendas-${exportFrom}-a-${exportTo}.${format}`);
      avisar(`Arquivo ${format.toUpperCase()} gerado.`);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Não foi possível exportar o relatório.');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div>
      <h1 className="mb-6 titulo-pagina">Relatórios</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-1 text-lg font-medium">Meta de vendas mensal</h2>
          <p className="mb-3 text-xs text-suave">Usada no painel para mostrar o progresso do mês.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-suave">Mês</span>
              <input type="month" className="input" value={goalMonth} onChange={(e) => setGoalMonth(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-suave">Meta (R$)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="input w-40"
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
              />
            </label>
            <Botao onClick={saveGoal} disabled={!goalAmount} carregando={savingGoal}>
              Salvar meta
            </Botao>
          </div>
          {goalError && (
            <div className="mt-2">
              <ErrorNotice message={goalError} />
            </div>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-lg font-medium">Exportar vendas</h2>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-suave">De</span>
              <input type="date" className="input" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-suave">Até</span>
              <input type="date" className="input" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
            </label>
            <Botao
              variante="secondary"
              onClick={() => exportReport('csv')}
              disabled={!exportFrom || !exportTo || exporting !== null}
              carregando={exporting === 'csv'}
            >
              Baixar CSV
            </Botao>
            <Botao
              variante="secondary"
              onClick={() => exportReport('pdf')}
              disabled={!exportFrom || !exportTo || exporting !== null}
              carregando={exporting === 'pdf'}
            >
              Baixar PDF
            </Botao>
          </div>
          {exportError && (
            <div className="mt-2">
              <ErrorNotice message={exportError} />
            </div>
          )}
        </section>

        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-3 text-lg font-medium">Comparativo de períodos</h2>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-tenue">Período A</div>
              <div className="flex gap-2">
                <input type="date" className="input" value={fromA} onChange={(e) => setFromA(e.target.value)} />
                <input type="date" className="input" value={toA} onChange={(e) => setToA(e.target.value)} />
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-tenue">Período B</div>
              <div className="flex gap-2">
                <input type="date" className="input" value={fromB} onChange={(e) => setFromB(e.target.value)} />
                <input type="date" className="input" value={toB} onChange={(e) => setToB(e.target.value)} />
              </div>
            </div>
          </div>
          <Botao onClick={compare} disabled={!fromA || !toA || !fromB || !toB} carregando={comparing}>
            Comparar
          </Botao>
          {compareError && (
            <div className="mt-2">
              <ErrorNotice message={compareError} />
            </div>
          )}

          {comparison && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Duas barras lado a lado dizem em um olhar o que os seis
                  números abaixo dizem depois de lidos e subtraídos. */}
              <div className="sm:col-span-2">
                <GraficoBarras
                  dados={[
                    { id: 'a', rotulo: 'Período A', valor: comparison.periodA.total, detalhe: `${comparison.periodA.count} vendas` },
                    { id: 'b', rotulo: 'Período B', valor: comparison.periodB.total, detalhe: `${comparison.periodB.count} vendas` },
                  ]}
                  formatar={formatarMoeda}
                />
              </div>
              <PeriodBlock title="Período A" stats={comparison.periodA} />
              <PeriodBlock title="Período B" stats={comparison.periodB} />
              <div className="sm:col-span-2 rounded-lg bg-realce p-3 text-sm">
                <ChangeLine label="Variação de faturamento (A em relação a B)" pct={comparison.revenueChangePct} />
                <ChangeLine label="Variação no número de vendas (A em relação a B)" pct={comparison.salesCountChangePct} />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PeriodBlock({ title, stats }: { title: string; stats: PeriodComparison['periodA'] }) {
  return (
    <div className="rounded-lg border border-linha p-3 text-sm">
      <div className="mb-2 font-medium">{title}</div>
      <div className="flex justify-between text-suave">
        <span>Faturamento</span>
        <span className="text-texto">{formatarMoeda(stats.total)}</span>
      </div>
      <div className="flex justify-between text-suave">
        <span>Vendas</span>
        <span className="text-texto">{stats.count}</span>
      </div>
      <div className="flex justify-between text-suave">
        <span>Ticket médio</span>
        <span className="text-texto">{formatarMoeda(stats.averageTicket)}</span>
      </div>
    </div>
  );
}

function ChangeLine({ label, pct }: { label: string; pct: number | null }) {
  const color = pct === null ? 'text-suave' : pct >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  return (
    <div className="flex justify-between">
      <span className="text-suave">{label}</span>
      <span className={color}>{pct === null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}</span>
    </div>
  );
}
