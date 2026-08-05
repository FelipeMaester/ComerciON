'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import type { Customer, PaymentMethod, Product, Sale, Warehouse } from '@/lib/types';

interface CartLine {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

interface PaymentLine {
  method: PaymentMethod;
  installments: number;
  amount: number;
}

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Dinheiro',
  DEBIT_CARD: 'Cartão de débito',
  CREDIT_CARD: 'Cartão de crédito',
  PIX: 'PIX',
  BOLETO: 'Boleto',
};

export default function PosPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

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
  }, []);

  const selectedCustomer = customers.find((c) => c.id === customerId);

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [cart],
  );
  const total = Math.max(0, subtotal - Number(saleDiscount || 0));
  const paymentsSum = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const paymentsMatch = Math.abs(paymentsSum - total) < 0.01;

  const filteredProducts = productQuery
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(productQuery.toLowerCase()) ||
          p.sku.toLowerCase().includes(productQuery.toLowerCase()) ||
          (p.barcode ?? '').includes(productQuery),
      )
    : [];

  function addToCart(product: Product) {
    const unitPrice = Number(selectedCustomer?.priceTier === 'WHOLESALE' ? product.wholesalePrice : product.retailPrice);
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
      setError('A soma dos pagamentos precisa ser igual ao total da venda.');
      return;
    }
    setSaving(true);
    try {
      const hasPayments = payments.some((p) => p.amount > 0);
      const sale = await api.post<Sale>('/sales', {
        customerId: customerId || undefined,
        warehouseId,
        items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
        payments: hasPayments ? payments.map((p) => ({ method: p.method, installments: p.installments, amount: p.amount })) : undefined,
        discount: Number(saleDiscount || 0),
        confirm: shouldConfirm,
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
        <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
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
                  {c.name} {c.priceTier === 'WHOLESALE' ? '(atacado)' : ''}
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
              <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {filteredProducts.slice(0, 8).map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => addToCart(p)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span>
                        <span className="font-mono text-xs text-slate-400">{p.sku}</span> {p.name}
                      </span>
                      <span className="text-slate-500">
                        R$ {Number(selectedCustomer?.priceTier === 'WHOLESALE' ? p.wholesalePrice : p.retailPrice).toFixed(2)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
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
                <tr key={line.productId} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-slate-400">{line.sku}</span> {line.name}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      className="w-16 rounded border border-slate-300 px-2 py-1"
                      value={line.quantity}
                      onChange={(e) => updateQuantity(line.productId, Number(e.target.value))}
                    />
                  </td>
                  <td className="px-3 py-2">R$ {line.unitPrice.toFixed(2)}</td>
                  <td className="px-3 py-2">R$ {(line.quantity * line.unitPrice).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeLine(line.productId)} className="text-slate-400 hover:text-red-600">
                      remover
                    </button>
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                    Carrinho vazio — busque um produto acima.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex justify-between text-sm text-slate-600">
            <span>Subtotal</span>
            <span>R$ {subtotal.toFixed(2)}</span>
          </div>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-slate-600">Desconto (R$)</span>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={saleDiscount}
              onChange={(e) => setSaleDiscount(e.target.value)}
            />
          </label>
          <div className="mb-4 flex justify-between border-t border-slate-100 pt-3 text-base font-semibold">
            <span>Total</span>
            <span>R$ {total.toFixed(2)}</span>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Pagamento</span>
            <button onClick={addPaymentLine} className="text-xs text-slate-500 hover:text-slate-900">
              + adicionar forma
            </button>
          </div>
          <div className="space-y-2">
            {payments.map((p, i) => (
              <div key={i} className="flex gap-2">
                <select
                  className="input"
                  value={p.method}
                  onChange={(e) => updatePayment(i, { method: e.target.value as PaymentMethod })}
                >
                  {Object.entries(PAYMENT_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {(p.method === 'CREDIT_CARD' || p.method === 'BOLETO') && (
                  <input
                    className="input w-20"
                    type="number"
                    min={1}
                    placeholder="Parcelas"
                    value={p.installments}
                    onChange={(e) => updatePayment(i, { installments: Number(e.target.value) })}
                  />
                )}
                <input
                  className="input w-28"
                  type="number"
                  min={0}
                  step="0.01"
                  value={p.amount}
                  onChange={(e) => updatePayment(i, { amount: Number(e.target.value) })}
                />
                {payments.length > 1 && (
                  <button onClick={() => removePaymentLine(i)} className="text-slate-400 hover:text-red-600">
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className={`mt-2 text-xs ${paymentsMatch ? 'text-emerald-600' : 'text-amber-600'}`}>
            Pagamentos: R$ {paymentsSum.toFixed(2)} {paymentsMatch ? '✓ confere com o total' : `(faltam R$ ${(total - paymentsSum).toFixed(2)})`}
          </p>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button
            onClick={() => finalizeSale(true)}
            disabled={saving || cart.length === 0}
            className="mt-4 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Finalizar venda'}
          </button>
          <button
            onClick={() => finalizeSale(false)}
            disabled={saving || cart.length === 0}
            className="mt-2 w-full rounded-lg border border-slate-300 py-2.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Salvar como orçamento
          </button>
        </div>
      </div>
    </div>
  );
}
