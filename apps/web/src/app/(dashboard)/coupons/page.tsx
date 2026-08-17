'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { Coupon, CouponDiscountType } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

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
        <h1 className="titulo-pagina">Cupons de desconto</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary"
        >
          {showForm ? 'Cancelar' : 'Novo cupom'}
        </button>
      </div>

      <p className="mb-4 text-sm text-suave">
        Cupons valem no PDV e nas vendas do balcão. Um cupom desativado para de ser aceito na hora,
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
        <p className="text-sm text-suave">Carregando…</p>
      ) : (
        <CouponsTable coupons={coupons} onToggle={toggleActive} />
      )}
    </div>
  );
}

function CouponsTable({ coupons, onToggle }: { coupons: Coupon[]; onToggle: (c: Coupon) => void }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="tabela card">
        <thead>
          <tr>
            <th>Código</th>
            <th>Desconto</th>
            <th>Pedido mínimo</th>
            <th>Validade</th>
            <th>Usos</th>
            <th>Situação</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {coupons.map((c) => (
            <tr key={c.id}>
              <td className="font-mono font-medium">{c.code}</td>
              <td>
                {c.discountType === 'PERCENTAGE' ? `${Number(c.value)}%` : `${formatarMoeda(Number(c.value))}`}
                {c.freeShipping && <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">+ frete grátis</span>}
              </td>
              <td>{c.minOrderValue ? `${formatarMoeda(Number(c.minOrderValue))}` : '—'}</td>
              <td className="text-xs text-suave">{describeValidity(c)}</td>
              <td>
                {c.usedCount}
                {c.usageLimit ? ` / ${c.usageLimit}` : ''}
                {c.usageLimit != null && c.usedCount >= c.usageLimit && (
                  <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">esgotado</span>
                )}
              </td>
              <td className={`px-4 py-2 ${c.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-tenue'}`}>
                {c.isActive ? 'Ativo' : 'Inativo'}
              </td>
              <td className="text-right">
                <button onClick={() => onToggle(c)} className="text-xs underline text-suave hover:text-texto">
                  {c.isActive ? 'Desativar' : 'Reativar'}
                </button>
              </td>
            </tr>
          ))}
          {coupons.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-tenue">
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
      className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-3"
    >
      <label className="text-sm">
        <span className="mb-1 block text-suave">Código*</span>
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
        <span className="mb-1 block text-suave">Tipo*</span>
        <select className="input" value={discountType} onChange={(e) => setDiscountType(e.target.value as CouponDiscountType)}>
          <option value="PERCENTAGE">Percentual (%)</option>
          <option value="FIXED">Valor fixo (R$)</option>
        </select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-suave">
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
        <span className="mb-1 block text-suave">Pedido mínimo (R$)</span>
        <input className="input" type="number" step="0.01" min={0} value={minOrderValue} onChange={(e) => setMinOrderValue(e.target.value)} />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-suave">Válido de</span>
        <input className="input" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-suave">Válido até</span>
        <input className="input" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-suave">Limite de usos</span>
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
        <span className="text-suave">Dá frete grátis</span>
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
