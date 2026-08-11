'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { cardFeeAmount as computeCardFeeAmount, grossUpForCardFee } from '@/lib/cardFee';
import type { Customer, PaymentMethod, Product, Sale, TenantSettings, Warehouse } from '@/lib/types';

interface CartLine {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

type PosPaymentMethod = PaymentMethod | 'FIADO';

const INSTALLMENT_COUNTS = Array.from({ length: 12 }, (_, i) => i + 1);

interface PaymentLine {
  method: PosPaymentMethod;
  installments: number;
  // Cartão de crédito: `amount` guarda o valor BASE (o que o lojista quer
  // receber); o valor cobrado do cliente (com a taxa repassada) é derivado
  // via cardFeePercent — ver grossAmount() abaixo. Para as demais formas,
  // `amount` já é o valor final.
  amount: number;
  days?: number;
  cardFeePercent?: number;
}

const PAYMENT_LABEL: Record<PosPaymentMethod, string> = {
  CASH: 'Dinheiro',
  DEBIT_CARD: 'Cartão de débito',
  CREDIT_CARD: 'Cartão de crédito',
  PIX: 'PIX',
  BOLETO: 'Boleto',
  FIADO: 'Fiado',
};

export default function PosPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cardFeeRates, setCardFeeRates] = useState<number[]>(Array(12).fill(0));

  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [saleDiscount, setSaleDiscount] = useState('0');
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: 'CASH', installments: 1, amount: 0 }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);

  useEffect(() => {
    api.get<Customer[]>('/customers').then(setCustomers).catch(() => undefined);
    api.get<Product[]>('/products').then(setProducts).catch(() => undefined);
    api.get<Warehouse[]>('/warehouses').then((data) => {
      setWarehouses(data);
      const def = data.find((w) => w.isDefault) ?? data[0];
      if (def) setWarehouseId(def.id);
    });
    api
      .get<TenantSettings>('/settings')
      .then((data) => setCardFeeRates(data.cardFeeRates && data.cardFeeRates.length === 12 ? data.cardFeeRates : Array(12).fill(0)))
      .catch(() => undefined);
  }, []);

  // Cartão de crédito: `p.amount` é o valor base desejado, o valor
  // efetivamente cobrado (com o repasse da taxa) é derivado daqui.
  function grossAmount(p: PaymentLine): number {
    if (p.method !== 'CREDIT_CARD') return Number(p.amount || 0);
    return grossUpForCardFee(Number(p.amount || 0), p.cardFeePercent ?? 0);
  }

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [cart],
  );
  const totalCardFee = payments
    .filter((p) => p.method === 'CREDIT_CARD')
    .reduce((sum, p) => sum + computeCardFeeAmount(Number(p.amount || 0), p.cardFeePercent ?? 0), 0);
  const total = Math.max(0, subtotal - Number(saleDiscount || 0)) + totalCardFee;
  const paymentsSum = payments.reduce((sum, p) => sum + grossAmount(p), 0);
  const paymentsMatch = Math.abs(paymentsSum - total) < 0.01;
  const selectedCustomer = customers.find((c) => c.id === customerId);
  // Fiado exige um cliente identificado (não dá pra cobrar "cliente avulso"
  // depois) — qualquer cliente cadastrado serve, não precisa de nenhum
  // cadastro prévio especial.
  const canFiado = !!customerId;
  const remaining = Math.max(0, Math.round((total - paymentsSum) * 100) / 100);
  const fiadoLine = payments.find((p) => p.method === 'FIADO');

  const filteredProducts = productQuery
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(productQuery.toLowerCase()) ||
          p.sku.toLowerCase().includes(productQuery.toLowerCase()) ||
          (p.barcode ?? '').includes(productQuery),
      )
    : [];

  function addToCart(product: Product) {
    const unitPrice = Number(product.price);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { productId: product.id, sku: product.sku, name: product.name, quantity: 1, unitPrice }];
    });
    setProductQuery('');
  }

  function updateQuantity(productId: string, quantity: number) {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(1, quantity) } : l)));
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  function updatePayment(index: number, patch: Partial<PaymentLine>) {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addPaymentLine() {
    setPayments((prev) => [...prev, { method: 'CASH', installments: 1, amount: 0 }]);
  }

  function removePaymentLine(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  }

  async function finalizeSale(shouldConfirm: boolean) {
    setError(null);
    if (cart.length === 0) {
      setError('Adicione ao menos um produto.');
      return;
    }
    if (shouldConfirm && !paymentsMatch) {
      setError(
        canFiado
          ? `A soma dos pagamentos precisa fechar com o total — use a forma "Fiado" para o valor que ficará pendente.`
          : 'A soma dos pagamentos precisa ser igual ao total da venda (ou selecione um cliente para vender fiado).',
      );
      return;
    }
    setSaving(true);
    try {
      const realPayments = payments.filter((p) => p.method !== 'FIADO' && p.amount > 0);
      const sale = await api.post<Sale>('/sales', {
        customerId: customerId || undefined,
        warehouseId,
        items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
        payments:
          realPayments.length > 0
            ? realPayments.map((p) => ({ method: p.method as PaymentMethod, installments: p.installments, amount: grossAmount(p) }))
            : undefined,
        discount: Number(saleDiscount || 0),
        confirm: shouldConfirm,
        fiadoDays: fiadoLine?.days,
        cardFeeAmount: totalCardFee > 0 ? totalCardFee : undefined,
      });
      setSuccessId(sale.id);
      setCart([]);
      setPayments([{ method: 'CASH', installments: 1, amount: 0 }]);
      setSaleDiscount('0');
      setCustomerId('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a venda.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">PDV — Venda rápida</h1>

      {successId && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <span>Venda salva com sucesso!</span>
          <button onClick={() => router.push(`/sales/${successId}`)} className="font-medium underline">
            Ver venda
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Cliente avulso</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="relative mb-4">
            <input
              className="input"
              placeholder="Buscar produto por nome, SKU ou código de barras..."
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
            />
            {filteredProducts.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
                {filteredProducts.slice(0, 8).map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => addToCart(p)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <span>
                        <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{p.sku}</span> {p.name}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">R$ {Number(p.price).toFixed(2)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">Produto</th>
                <th className="px-3 py-2">Qtd</th>
                <th className="px-3 py-2">Preço unit.</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {cart.map((line) => (
                <tr key={line.productId} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{line.sku}</span> {line.name}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step={1}
                      min={1}
                      className="input w-16 px-2 py-1"
                      value={line.quantity}
                      onChange={(e) => updateQuantity(line.productId, Number(e.target.value))}
                    />
                  </td>
                  <td className="px-3 py-2">R$ {line.unitPrice.toFixed(2)}</td>
                  <td className="px-3 py-2">R$ {(line.quantity * line.unitPrice).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeLine(line.productId)} className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400">
                      remover
                    </button>
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400 dark:text-slate-500">
                    Carrinho vazio — busque um produto acima.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="mb-3 flex justify-between text-sm text-slate-600 dark:text-slate-300">
            <span>Subtotal</span>
            <span>R$ {subtotal.toFixed(2)}</span>
          </div>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Desconto (R$)</span>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={saleDiscount}
              onChange={(e) => setSaleDiscount(e.target.value)}
            />
          </label>
          <div className="mb-4 flex justify-between border-t border-slate-100 dark:border-slate-800 pt-3 text-base font-semibold">
            <span>Total</span>
            <span>R$ {total.toFixed(2)}</span>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Pagamento</span>
            <button onClick={addPaymentLine} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
              + adicionar forma
            </button>
          </div>
          <div className="space-y-2">
            {payments.map((p, i) => (
              <div key={i} className="flex gap-2">
                <select
                  className="input"
                  value={p.method}
                  onChange={(e) => {
                    const method = e.target.value as PosPaymentMethod;
                    if (method === 'FIADO') {
                      updatePayment(i, { method, amount: remaining + Number(p.amount || 0), days: selectedCustomer?.paymentTermDays ?? 30 });
                    } else if (method === 'CREDIT_CARD') {
                      const installments = p.installments || 1;
                      updatePayment(i, {
                        method,
                        installments,
                        amount: remaining + grossAmount(p),
                        cardFeePercent: cardFeeRates[installments - 1] ?? 0,
                      });
                    } else {
                      updatePayment(i, { method });
                    }
                  }}
                >
                  {Object.entries(PAYMENT_LABEL)
                    .filter(([value]) => value !== 'FIADO' || canFiado)
                    .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                </select>
                {p.method === 'CREDIT_CARD' && (
                  <select
                    className="input w-20"
                    value={p.installments}
                    onChange={(e) => {
                      const installments = Number(e.target.value);
                      updatePayment(i, { installments, cardFeePercent: cardFeeRates[installments - 1] ?? 0 });
                    }}
                  >
                    {INSTALLMENT_COUNTS.map((n) => (
                      <option key={n} value={n}>
                        {n}x
                      </option>
                    ))}
                  </select>
                )}
                {p.method === 'CREDIT_CARD' && (
                  <input
                    className="input w-16"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    title="Taxa da maquininha (%)"
                    placeholder="Taxa %"
                    value={p.cardFeePercent ?? 0}
                    onChange={(e) => updatePayment(i, { cardFeePercent: Number(e.target.value) })}
                  />
                )}
                {p.method === 'BOLETO' && (
                  <input
                    className="input w-20"
                    type="number"
                    step={1}
                    min={1}
                    placeholder="Parcelas"
                    value={p.installments}
                    onChange={(e) => updatePayment(i, { installments: Number(e.target.value) })}
                  />
                )}
                {p.method === 'FIADO' && (
                  <input
                    className="input w-20"
                    type="number"
                    step={1}
                    min={1}
                    max={365}
                    placeholder="Dias"
                    value={p.days ?? selectedCustomer?.paymentTermDays ?? 30}
                    onChange={(e) => updatePayment(i, { days: Math.max(1, Math.min(365, Number(e.target.value))) })}
                  />
                )}
                <input
                  className="input w-28"
                  type="number"
                  min={0}
                  step="0.01"
                  title={p.method === 'CREDIT_CARD' ? 'Valor base (sem a taxa) — o valor cobrado no cartão é calculado ao lado' : undefined}
                  value={p.amount}
                  onChange={(e) => updatePayment(i, { amount: Number(e.target.value) })}
                />
                {payments.length > 1 && (
                  <button onClick={() => removePaymentLine(i)} className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400">
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className={`mt-2 text-xs ${paymentsMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            Pagamentos: R$ {paymentsSum.toFixed(2)} {paymentsMatch ? '✓ confere com o total' : `(faltam R$ ${remaining.toFixed(2)})`}
          </p>
          {fiadoLine && fiadoLine.amount > 0 && (
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
              R$ {Number(fiadoLine.amount).toFixed(2)} ficam como fiado, vencendo em {fiadoLine.days ?? selectedCustomer?.paymentTermDays} dias.
            </p>
          )}
          {payments
            .filter((p) => p.method === 'CREDIT_CARD' && p.amount > 0)
            .map((p, i) => (
              <p key={i} className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                {p.installments}x no cartão: R$ {grossAmount(p).toFixed(2)} cobrado (R${' '}
                {computeCardFeeAmount(Number(p.amount), p.cardFeePercent ?? 0).toFixed(2)} de taxa repassada, {(p.cardFeePercent ?? 0).toFixed(2)}%).
              </p>
            ))}
          {!paymentsMatch && !fiadoLine && canFiado && remaining > 0 && (
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
              Use a forma &quot;Fiado&quot; para deixar os R$ {remaining.toFixed(2)} restantes pendentes.
            </p>
          )}
          {!paymentsMatch && !canFiado && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Selecione um cliente cadastrado (não avulso) para vender fiado.
            </p>
          )}

          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            onClick={() => finalizeSale(true)}
            disabled={saving || cart.length === 0}
            className="mt-4 w-full rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Finalizar venda'}
          </button>
          <button
            onClick={() => finalizeSale(false)}
            disabled={saving || cart.length === 0}
            className="mt-2 w-full rounded-lg border border-slate-300 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Salvar como orçamento
          </button>
        </div>
      </div>
    </div>
  );
}
