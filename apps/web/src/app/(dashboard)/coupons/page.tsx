'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { Coupon, CouponDiscountType } from '@/lib/types';

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setCoupons(await api.get<Coupon[]>('/coupons'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os cupons.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(coupon: Coupon) {
    try {
      await api.patch(`/coupons/${coupon.id}`, { isActive: !coupon.isActive });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível alterar o cupom.');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cupons de desconto</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {showForm ? 'Cancelar' : 'Novo cupom'}
        </button>
      </div>

      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Cupons valem na loja virtual e também no PDV. Um cupom desativado para de ser aceito na hora,
        mas as vendas que já o usaram não mudam.
      </p>

      {showForm && (
        <CreateCouponForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : (
        <CouponsTable coupons={coupons} onToggle={toggleActive} />
      )}
    </div>
  );
}

function CouponsTable({ coupons, onToggle }: { coupons: Coupon[]; onToggle: (c: Coupon) => void }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-900">
        <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <tr>
            <th className="px-4 py-2">Código</th>
            <th className="px-4 py-2">Desconto</th>
            <th className="px-4 py-2">Pedido mínimo</th>
            <th className="px-4 py-2">Validade</th>
            <th className="px-4 py-2">Usos</th>
            <th className="px-4 py-2">Situação</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {coupons.map((c) => (
            <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
              <td className="px-4 py-2 font-mono font-medium">{c.code}</td>
              <td className="px-4 py-2">
                {c.discountType === 'PERCENTAGE' ? `${Number(c.value)}%` : `R$ ${Number(c.value).toFixed(2)}`}
                {c.freeShipping && <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">+ frete grátis</span>}
              </td>
              <td className="px-4 py-2">{c.minOrderValue ? `R$ ${Number(c.minOrderValue).toFixed(2)}` : '—'}</td>
              <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{describeValidity(c)}</td>
              <td className="px-4 py-2">
                {c.usedCount}
                {c.usageLimit ? ` / ${c.usageLimit}` : ''}
                {c.usageLimit != null && c.usedCount >= c.usageLimit && (
                  <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">esgotado</span>
                )}
              </td>
              <td className={`px-4 py-2 ${c.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                {c.isActive ? 'Ativo' : 'Inativo'}
              </td>
              <td className="px-4 py-2 text-right">
                <button onClick={() => onToggle(c)} className="text-xs underline text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100">
                  {c.isActive ? 'Desativar' : 'Reativar'}
                </button>
              </td>
            </tr>
          ))}
          {coupons.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                Nenhum cupom criado ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Texto de validade que também avisa quando o cupom já venceu. */
function describeValidity(coupon: Coupon): string {
  const format = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

  if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
    return `Venceu em ${format(coupon.validUntil)}`;
  }
  if (coupon.validFrom && coupon.validUntil) return `${format(coupon.validFrom)} a ${format(coupon.validUntil)}`;
  if (coupon.validUntil) return `Até ${format(coupon.validUntil)}`;
  if (coupon.validFrom) return `A partir de ${format(coupon.validFrom)}`;
  return 'Sem prazo';
}

function CreateCouponForm({ onCreated }: { onCreated: () => void }) {
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<CouponDiscountType>('PERCENTAGE');
  const [value, setValue] = useState('');
  const [freeShipping, setFreeShipping] = useState(false);
  const [minOrderValue, setMinOrderValue] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Barrado aqui porque 150% de desconto passaria no @Min(0) do servidor e
    // só apareceria como venda de valor negativo mais tarde.
    if (discountType === 'PERCENTAGE' && Number(value) > 100) {
      setError('Desconto percentual não pode passar de 100%.');
      return;
    }
    if (validFrom && validUntil && new Date(validFrom) > new Date(validUntil)) {
      setError('A data final não pode ser anterior à inicial.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/coupons', {
        code: code.trim().toUpperCase(),
        discountType,
        value: Number(value),
        freeShipping,
        minOrderValue: minOrderValue ? Number(minOrderValue) : undefined,
        // O input date manda 'AAAA-MM-DD'; a API espera ISO completo.
        validFrom: validFrom ? new Date(`${validFrom}T00:00:00`).toISOString() : undefined,
        validUntil: validUntil ? new Date(`${validUntil}T23:59:59`).toISOString() : undefined,
        usageLimit: usageLimit ? Number(usageLimit) : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o cupom.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3 dark:border-slate-700 dark:bg-slate-900"
    >
      <label className="text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">Código*</span>
        <input
          className="input font-mono uppercase"
          placeholder="BEMVINDO10"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          minLength={3}
          required
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">Tipo*</span>
        <select className="input" value={discountType} onChange={(e) => setDiscountType(e.target.value as CouponDiscountType)}>
          <option value="PERCENTAGE">Percentual (%)</option>
          <option value="FIXED">Valor fixo (R$)</option>
        </select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">
          {discountType === 'PERCENTAGE' ? 'Desconto (%)*' : 'Desconto (R$)*'}
        </span>
        <input
          className="input"
          type="number"
          step="0.01"
          min={0}
          max={discountType === 'PERCENTAGE' ? 100 : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">Pedido mínimo (R$)</span>
        <input className="input" type="number" step="0.01" min={0} value={minOrderValue} onChange={(e) => setMinOrderValue(e.target.value)} />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">Válido de</span>
        <input className="input" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">Válido até</span>
        <input className="input" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">Limite de usos</span>
        <input
          className="input"
          type="number"
          step={1}
          min={1}
          placeholder="Sem limite"
          value={usageLimit}
          onChange={(e) => setUsageLimit(e.target.value)}
        />
      </label>

      <label className="flex items-center gap-2 self-end text-sm sm:col-span-2">
        <input type="checkbox" checked={freeShipping} onChange={(e) => setFreeShipping(e.target.checked)} />
        <span className="text-slate-600 dark:text-slate-300">Dá frete grátis</span>
      </label>

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Salvando…' : 'Criar cupom'}
        </button>
      </div>
    </form>
  );
}
