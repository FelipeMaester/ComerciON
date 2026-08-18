'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Botao } from '@/components/Botao';
import { GraficoBarras } from '@/components/graficos';
import type { CashFlowSummary } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

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
      <button onClick={() => router.push('/finance')} className="mb-4 text-sm text-suave hover:text-texto">
        ← Voltar
      </button>

      <h1 className="mb-4 titulo-pagina">Fluxo de caixa</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="mb-6 flex flex-wrap items-end gap-3"
      >
        <label className="text-sm">
          <span className="mb-1 block text-suave">De</span>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-suave">Até</span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Botao type="submit" variante="secondary" carregando={loading}>
          Atualizar
        </Botao>
      </form>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card space-y-3 p-4">
              <div className="esqueleto h-4 w-40" />
              <div className="esqueleto h-24 w-full" />
            </div>
          ))}
        </div>
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
    <div className="card p-4">
      <h2 className="mb-3 text-sm font-medium text-suave">{title}</h2>

      {/* Receita e despesa na mesma escala: a barra mostra de imediato se o
          mês está sobrando ou apertando, antes de ler qualquer número. Verde e
          vermelho fixos, e não a cor da loja — aqui a cor tem significado. */}
      <div className="mb-3">
        <GraficoBarras
          dados={[
            { id: 'receitas', rotulo: 'Receitas', valor: data.receitas },
            { id: 'despesas', rotulo: 'Despesas', valor: data.despesas },
          ]}
          formatar={formatarMoeda}
          cor={(i) => (i === 0 ? 'rgb(16 185 129)' : 'rgb(239 68 68)')}
        />
      </div>

      <div className="flex justify-between border-t border-linha pt-2.5 text-sm font-semibold">
        <span>Saldo</span>
        <span className={data.saldo >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
          {formatarMoeda(data.saldo)}
        </span>
      </div>
    </div>
  );
}
