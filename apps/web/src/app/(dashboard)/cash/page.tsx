'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { CashMovementType, CashSession } from '@/lib/types';

const brl = (v: number | string) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CashPage() {
  const [session, setSession] = useState<CashSession | null>(null);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [current, sessions] = await Promise.all([
        api.get<CashSession | null>('/cash/current'),
        api.get<CashSession[]>('/cash/sessions?limit=15'),
      ]);
      setSession(current);
      setHistory(sessions);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o caixa.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <CarregandoLista />;
  if (error) return <ErrorNotice message={error} compact={false} />;

  return (
    <div>
      <h1 className="mb-6 titulo-pagina">Caixa</h1>

      {session ? <OpenSessionPanel session={session} onChanged={load} /> : <OpenCashForm onOpened={load} />}

      <h2 className="mb-2 mt-8 text-sm font-semibold text-suave">Fechamentos anteriores</h2>
      <SessionHistory sessions={history} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function OpenCashForm({ onOpened }: { onOpened: () => void }) {
  const [amount, setAmount] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/cash/open', { openingAmount: Number(amount) });
      onOpened();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível abrir o caixa.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card max-w-md p-5"
    >
      <p className="font-medium text-texto">Seu caixa está fechado</p>
      <p className="mt-1 text-sm text-suave">
        Informe quanto de troco está na gaveta agora. As vendas que você registrar entram nesta conferência.
      </p>

      <label className="mt-4 block text-sm text-suave">
        <span className="mb-1 block text-tenue">Troco inicial (R$)</span>
        <input
          className="input"
          type="number"
          step="0.01"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
          required
        />
      </label>

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary mt-4">
        {saving ? 'Abrindo…' : 'Abrir caixa'}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

function OpenSessionPanel({ session, onChanged }: { session: CashSession; onChanged: () => void }) {
  const s = session.summary;
  if (!s) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium text-emerald-900 dark:text-emerald-200">
            Caixa aberto desde {new Date(session.openedAt).toLocaleString('pt-BR')}
          </p>
          <p className="text-2xl font-semibold text-emerald-900 dark:text-emerald-100">{brl(s.expectedAmount)}</p>
        </div>
        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Dinheiro que deve estar na gaveta agora · {s.salesCount} venda{s.salesCount === 1 ? '' : 's'} nesta sessão
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Troco inicial" value={s.openingAmount} />
        <Stat label="Vendas em dinheiro" value={s.cashSales} positive />
        <Stat label="Suprimentos" value={s.deposits} positive />
        <Stat label="Sangrias" value={-s.withdrawals} />
        <Stat label="Cartão / Pix" value={s.nonCashSales} muted />
      </div>

      <p className="text-xs text-suave">
        Cartão e Pix aparecem só para conferência — esse dinheiro não está na gaveta e não entra no valor esperado.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <MovementForm onDone={onChanged} />
        <CloseCashForm expectedHint={s.salesCount} onDone={onChanged} />
      </div>
    </div>
  );
}

function Stat({ label, value, positive, muted }: { label: string; value: number; positive?: boolean; muted?: boolean }) {
  const color = muted
    ? 'text-tenue'
    : value < 0
      ? 'text-red-600 dark:text-red-400'
      : positive
        ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-texto';

  return (
    <div className="card p-3">
      <p className="text-xs text-tenue">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{brl(value)}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MovementForm({ onDone }: { onDone: () => void }) {
  const [type, setType] = useState<CashMovementType>('WITHDRAWAL');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/cash/movements', { type, amount: Number(amount), reason });
      setAmount('');
      setReason('');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível registrar o movimento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card p-4"
    >
      <p className="mb-3 font-medium text-texto">Sangria / Suprimento</p>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-suave">
          <span className="mb-1 block text-tenue">Tipo</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as CashMovementType)}>
            <option value="WITHDRAWAL">Sangria (tirar da gaveta)</option>
            <option value="DEPOSIT">Suprimento (colocar na gaveta)</option>
          </select>
        </label>

        <label className="text-sm text-suave">
          <span className="mb-1 block text-tenue">Valor (R$)</span>
          <input
            className="input"
            type="number"
            step="0.01"
            min={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
      </div>

      <label className="mt-3 block text-sm text-suave">
        <span className="mb-1 block text-tenue">Motivo</span>
        <input
          className="input"
          placeholder="Ex.: levado ao cofre, pagamento do entregador"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
      </label>

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary mt-3">
        {saving ? 'Registrando…' : 'Registrar'}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Fechar o caixa: contar, confirmar, ver a diferença.
 *
 * A confirmação é uma etapa DENTRO da tela, e não um `window.confirm`.
 *
 * O diálogo nativo tinha três problemas num lugar onde se conta dinheiro: o
 * navegador pode suprimi-lo ("impedir que esta página crie mais diálogos", e aí
 * o botão simplesmente não faz nada, sem explicação); ele é fácil de dispensar
 * sem ler; e não mostra o valor que está sendo confirmado — pedia um "OK" para
 * uma frase genérica, quando o que importa é conferir os R$ 150,00 digitados.
 *
 * O que NÃO muda: a diferença continua escondida até a confirmação. Mostrar o
 * esperado antes de a pessoa contar transforma a conferência em cópia.
 */
function CloseCashForm({ expectedHint, onDone }: { expectedHint: number; onDone: () => void }) {
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CashSession | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmando(true);
  }

  async function fechar() {
    setSaving(true);
    setError(null);
    try {
      const closed = await api.post<CashSession>('/cash/close', {
        countedAmount: Number(counted),
        closingNotes: notes || undefined,
      });
      setResult(closed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível fechar o caixa.');
      // Volta para a contagem: com o erro na tela, insistir no botão de
      // confirmar sem entender o motivo não leva a lugar nenhum.
      setConfirmando(false);
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    const diff = Number(result.difference ?? 0);
    return (
      <div className="card p-4">
        <p className="font-medium text-texto">Caixa fechado</p>
        <dl className="mt-3 space-y-1 text-sm">
          <Row label="Você contou" value={brl(result.countedAmount ?? 0)} />
          <Row label="O sistema esperava" value={brl(result.expectedAmount ?? 0)} />
          <Row
            label={diff === 0 ? 'Conferido' : diff > 0 ? 'Sobrou' : 'Faltou'}
            value={diff === 0 ? 'Sem diferença' : brl(Math.abs(diff))}
            highlight={diff === 0 ? 'ok' : 'warn'}
          />
        </dl>
        <button onClick={onDone} className="btn-primary mt-4">
          Concluir
        </button>
      </div>
    );
  }

  if (confirmando) {
    return (
      <div className="card p-4">
        <p className="font-medium text-texto">Confirmar o fechamento</p>
        <p className="mt-1 text-sm text-suave">
          Você contou <strong className="text-texto">{brl(Number(counted))}</strong> na gaveta. Depois de fechar, esta
          sessão não aceita mais vendas.
        </p>

        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {/* `autoFocus` porque esta etapa apareceu por causa de um clique: o
              foco precisa vir junto para quem usa teclado não ficar procurando. */}
          <button autoFocus onClick={fechar} disabled={saving} className="btn-primary">
            {saving ? 'Fechando…' : 'Fechar o caixa'}
          </button>
          <button onClick={() => setConfirmando(false)} disabled={saving} className="btn-secondary">
            Voltar e conferir
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card p-4"
    >
      <p className="font-medium text-texto">Fechar caixa</p>
      <p className="mt-1 text-sm text-suave">
        Conte o dinheiro da gaveta e digite o valor. A diferença aparece depois que você confirmar — assim a
        conferência vale de verdade.
      </p>

      <label className="mt-3 block text-sm text-suave">
        <span className="mb-1 block text-tenue">Valor contado (R$)</span>
        <input
          className="input"
          type="number"
          step="0.01"
          min={0}
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          required
        />
      </label>

      <label className="mt-3 block text-sm text-suave">
        <span className="mb-1 block text-tenue">Observação (opcional)</span>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {expectedHint === 0 && (
        <p className="mt-2 text-xs text-tenue">
          Nenhuma venda foi registrada nesta sessão.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary mt-3">
        {saving ? 'Fechando…' : 'Conferir e fechar'}
      </button>
    </form>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: 'ok' | 'warn' }) {
  const color =
    highlight === 'ok'
      ? 'text-emerald-700 dark:text-emerald-400'
      : highlight === 'warn'
        ? 'text-red-600 dark:text-red-400'
        : 'text-texto';
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-suave">{label}</dt>
      <dd className={`font-medium ${color}`}>{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SessionHistory({ sessions }: { sessions: CashSession[] }) {
  const closed = sessions.filter((s) => s.status === 'CLOSED');
  if (closed.length === 0) {
    return <p className="text-sm text-tenue">Nenhum caixa fechado ainda.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs text-tenue">
          <tr>
            <th className="py-2">Operador</th>
            <th className="py-2">Aberto</th>
            <th className="py-2">Fechado</th>
            <th className="py-2 text-right">Esperado</th>
            <th className="py-2 text-right">Contado</th>
            <th className="py-2 text-right">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {closed.map((s) => {
            const diff = Number(s.difference ?? 0);
            return (
              <tr key={s.id}>
                <td className="py-2">{s.operator?.name ?? '—'}</td>
                <td className="py-2 text-suave">
                  {new Date(s.openedAt).toLocaleString('pt-BR')}
                </td>
                <td className="py-2 text-suave">
                  {s.closedAt ? new Date(s.closedAt).toLocaleString('pt-BR') : '—'}
                </td>
                <td className="py-2 text-right">{brl(s.expectedAmount ?? 0)}</td>
                <td className="py-2 text-right">{brl(s.countedAmount ?? 0)}</td>
                <td
                  className={`py-2 text-right font-medium ${
                    diff === 0
                      ? 'text-tenue'
                      : diff > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {diff === 0 ? '—' : brl(diff)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
