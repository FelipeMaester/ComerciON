'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { clearCart } from '@/lib/cart';
import { useCart, useIsLoggedIn } from '@/lib/hooks';
import { getTokens } from '@/lib/session';
import type { AddressType, CustomerAddress, FreightEstimate, PaymentMethod } from '@/lib/types';

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Dinheiro (na entrega)',
  DEBIT_CARD: 'Cartão de débito',
  CREDIT_CARD: 'Cartão de crédito',
  PIX: 'PIX',
  BOLETO: 'Boleto',
};

export default function CheckoutPage() {
  const router = useRouter();
  const cart = useCart();
  const loggedIn = useIsLoggedIn();

  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addressId, setAddressId] = useState('');
  const [showAddressForm, setShowAddressForm] = useState(false);

  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState<number | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);

  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const [installments, setInstallments] = useState(1);

  const [freight, setFreight] = useState<FreightEstimate | null>(null);
  const [freightError, setFreightError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  const subtotal = cart.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const freightCost = freight?.cost ?? 0;
  const total = Math.max(0, subtotal - (couponDiscount ?? 0) + freightCost);

  useEffect(() => {
    if (!getTokens()) {
      router.replace('/login?redirect=/checkout');
      return;
    }
    api.get<CustomerAddress[]>('/storefront/addresses').then((data) => {
      setAddresses(data);
      const def = data.find((a) => a.isDefault) ?? data[0];
      if (def) setAddressId(def.id);
      if (data.length === 0) setShowAddressForm(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const address = addresses.find((a) => a.id === addressId);
    if (!address || cart.length === 0) {
      setFreight(null);
      return;
    }
    setFreightError(null);
    api
      .post<FreightEstimate>('/storefront/freight/estimate', {
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        destinationState: address.state,
      })
      .then(setFreight)
      .catch((err) => setFreightError(err instanceof ApiError ? err.message : 'Não foi possível calcular o frete.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressId, addresses]);

  async function applyCoupon() {
    if (!couponCode) return;
    setCheckingCoupon(true);
    setCouponError(null);
    try {
      const result = await api.post<{ discountAmount: number }>('/storefront/coupons/validate', {
        code: couponCode,
        subtotal,
      });
      setCouponDiscount(result.discountAmount);
    } catch (err) {
      setCouponDiscount(null);
      setCouponError(err instanceof ApiError ? err.message : 'Cupom inválido.');
    } finally {
      setCheckingCoupon(false);
    }
  }

  async function placeOrder() {
    setError(null);
    if (!addressId) {
      setError('Selecione ou cadastre um endereço de entrega.');
      return;
    }
    setPlacing(true);
    try {
      const order = await api.post<{ id: string }>('/storefront/checkout', {
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        payments: [{ method, installments: method === 'CREDIT_CARD' || method === 'BOLETO' ? installments : 1, amount: total }],
        shippingAddressId: addressId,
        couponCode: couponDiscount !== null ? couponCode : undefined,
      });
      clearCart();
      router.push(`/account/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir o pedido.');
    } finally {
      setPlacing(false);
    }
  }

  if (!loggedIn) return null;
  if (cart.length === 0) return <p className="text-sm text-slate-500 dark:text-slate-400">Seu carrinho está vazio.</p>;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-3 text-lg font-medium">Endereço de entrega</h2>
          {addresses.map((addr) => (
            <label key={addr.id} className="mb-2 flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="address"
                checked={addressId === addr.id}
                onChange={() => setAddressId(addr.id)}
              />
              <span>
                {addr.street}, {addr.number ?? 's/n'} — {addr.city}/{addr.state} — {addr.zipCode}
              </span>
            </label>
          ))}
          <button onClick={() => setShowAddressForm((v) => !v)} className="mt-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
            {showAddressForm ? 'Cancelar' : '+ novo endereço'}
          </button>
          {showAddressForm && (
            <NewAddressForm
              onCreated={(addr) => {
                setAddresses((prev) => [...prev, addr]);
                setAddressId(addr.id);
                setShowAddressForm(false);
              }}
            />
          )}
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-3 text-lg font-medium">Cupom de desconto</h2>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Código do cupom"
              value={couponCode}
              onChange={(e) => {
                setCouponCode(e.target.value.toUpperCase());
                setCouponDiscount(null);
              }}
            />
            <button onClick={applyCoupon} disabled={checkingCoupon || !couponCode} className="btn-secondary">
              {checkingCoupon ? 'Verificando…' : 'Aplicar'}
            </button>
          </div>
          {couponError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{couponError}</p>}
          {couponDiscount !== null && (
            <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">Desconto aplicado: R$ {couponDiscount.toFixed(2)}</p>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <h2 className="mb-3 text-lg font-medium">Forma de pagamento</h2>
          <select className="input mb-2" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {Object.entries(PAYMENT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {(method === 'CREDIT_CARD' || method === 'BOLETO') && (
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Parcelas</span>
              <input
                type="number"
                min={1}
                max={12}
                className="input w-24"
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
              />
            </label>
          )}
        </section>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h2 className="mb-3 text-lg font-medium">Resumo</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Subtotal</dt>
            <dd>R$ {subtotal.toFixed(2)}</dd>
          </div>
          {couponDiscount !== null && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <dt>Desconto</dt>
              <dd>- R$ {couponDiscount.toFixed(2)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Frete{freight ? ` (~${freight.estimatedDays} dias)` : ''}</dt>
            <dd>{freight ? `R$ ${freight.cost.toFixed(2)}` : '—'}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>R$ {total.toFixed(2)}</dd>
          </div>
        </dl>

        {freightError && <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">{freightError}</p>}
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button onClick={placeOrder} disabled={placing} className="btn-primary mt-4 w-full">
          {placing ? 'Enviando pedido…' : 'Confirmar pedido'}
        </button>
      </div>
    </div>
  );
}

function NewAddressForm({ onCreated }: { onCreated: (address: CustomerAddress) => void }) {
  const [type] = useState<AddressType>('SHIPPING');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const address = await api.post<CustomerAddress>('/storefront/addresses', {
        type,
        street,
        number: number || undefined,
        city,
        state,
        zipCode,
        isDefault: true,
      });
      onCreated(address);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar o endereço.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 sm:grid-cols-3">
      <input className="input sm:col-span-2" placeholder="Rua" value={street} onChange={(e) => setStreet(e.target.value)} required />
      <input className="input" placeholder="Número" value={number} onChange={(e) => setNumber(e.target.value)} />
      <input className="input" placeholder="Cidade" value={city} onChange={(e) => setCity(e.target.value)} required />
      <input
        className="input"
        placeholder="UF"
        maxLength={2}
        value={state}
        onChange={(e) => setState(e.target.value.toUpperCase())}
        required
      />
      <input className="input" placeholder="CEP" value={zipCode} onChange={(e) => setZipCode(e.target.value)} required />
      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" disabled={saving} className="btn-secondary col-span-full">
        {saving ? 'Salvando…' : 'Salvar endereço'}
      </button>
    </form>
  );
}
