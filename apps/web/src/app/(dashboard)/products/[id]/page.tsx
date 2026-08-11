'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import type { Product, ProductEquivalent, StockMovementType, Warehouse } from '@/lib/types';

interface Movement {
  id: string;
  type: StockMovementType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string | null;
  createdAt: string;
  warehouse: Warehouse;
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [equivalents, setEquivalents] = useState<ProductEquivalent[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [equivToAdd, setEquivToAdd] = useState('');
  const [equivError, setEquivError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdjustForm, setShowAdjustForm] = useState(false);

  async function load() {
    try {
      const [productData, movementsData, equivalentsData] = await Promise.all([
        api.get<Product>(`/products/${params.id}`),
        api.get<Movement[]>(`/inventory/stock/products/${params.id}/movements`),
        api.get<ProductEquivalent[]>(`/products/${params.id}/equivalents`),
      ]);
      setProduct(productData);
      setMovements(movementsData);
      setEquivalents(equivalentsData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o produto.');
    }
  }

  async function addEquivalent() {
    if (!equivToAdd) return;
    setEquivError(null);
    try {
      const updated = await api.post<ProductEquivalent[]>(`/products/${params.id}/equivalents`, { equivalentId: equivToAdd });
      setEquivalents(updated);
      setEquivToAdd('');
    } catch (err) {
      setEquivError(err instanceof ApiError ? err.message : 'Não foi possível adicionar a peça equivalente.');
    }
  }

  async function removeEquivalent(equivalentId: string) {
    setEquivError(null);
    try {
      await api.delete(`/products/${params.id}/equivalents/${equivalentId}`);
      setEquivalents((prev) => prev.filter((p) => p.id !== equivalentId));
    } catch (err) {
      setEquivError(err instanceof ApiError ? err.message : 'Não foi possível remover a peça equivalente.');
    }
  }

  useEffect(() => {
    load();
    api.get<Warehouse[]>('/warehouses').then(setWarehouses).catch(() => undefined);
    api.get<Product[]>('/products').then(setAllProducts).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!product) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>;

  const totalStock = product.stockItems?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <div>
      <button onClick={() => router.push('/products')} className="mb-4 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
        ← Voltar
      </button>

      <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h1 className="mb-1 text-xl font-semibold">{product.name}</h1>
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">
          SKU: {product.sku} {product.barcode && `· Código de barras: ${product.barcode}`}
        </p>
        <dl className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-4">
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Marca</dt>
            <dd>{product.brand ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Aplicação</dt>
            <dd>{product.vehicleApplication ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Preço</dt>
            <dd>R$ {Number(product.price).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Estoque total</dt>
            <dd className={totalStock < product.minStock ? 'font-medium text-red-600 dark:text-red-400' : ''}>
              {totalStock} {totalStock < product.minStock && '(abaixo do mínimo)'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Estoque mínimo</dt>
            <dd>{product.minStock}</dd>
          </div>
        </dl>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h2 className="mb-3 text-lg font-medium">Peças equivalentes/similares</h2>
        <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
          Outras peças que servem no lugar desta (marcas diferentes, mesma aplicação) — mostradas ao cliente na loja virtual como alternativa.
        </p>

        {equivalents.length > 0 && (
          <ul className="mb-3 space-y-1">
            {equivalents.map((eq) => (
              <li
                key={eq.id}
                className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Link href={`/products/${eq.id}`} className="hover:underline">
                  {eq.name} · {eq.sku} {eq.brand && `· ${eq.brand}`} — R$ {Number(eq.price).toFixed(2)}
                </Link>
                <button
                  onClick={() => removeEquivalent(eq.id)}
                  className="text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <select className="input flex-1" value={equivToAdd} onChange={(e) => setEquivToAdd(e.target.value)}>
            <option value="">Selecione uma peça equivalente…</option>
            {allProducts
              .filter((p) => p.id !== product.id && !equivalents.some((eq) => eq.id === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.sku}
                </option>
              ))}
          </select>
          <button onClick={addEquivalent} disabled={!equivToAdd} className="btn-secondary shrink-0 disabled:opacity-50">
            Adicionar
          </button>
        </div>
        {equivError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{equivError}</p>}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium">Estoque por depósito</h2>
        <button
          onClick={() => setShowAdjustForm((v) => !v)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          {showAdjustForm ? 'Cancelar' : 'Movimentar estoque'}
        </button>
      </div>

      {showAdjustForm && (
        <AdjustStockForm
          productId={product.id}
          warehouses={warehouses}
          onDone={() => {
            setShowAdjustForm(false);
            load();
          }}
        />
      )}

      <table className="mb-6 w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-4 py-2">Depósito</th>
            <th className="px-4 py-2">Quantidade</th>
          </tr>
        </thead>
        <tbody>
          {product.stockItems?.map((item) => (
            <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-2">{item.warehouse.name}</td>
              <td className="px-4 py-2">{item.quantity}</td>
            </tr>
          ))}
          {(!product.stockItems || product.stockItems.length === 0) && (
            <tr>
              <td colSpan={2} className="px-4 py-4 text-center text-slate-400 dark:text-slate-500">
                Sem estoque registrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2 className="mb-3 text-lg font-medium">Histórico de movimentações</h2>
      <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-4 py-2">Data</th>
            <th className="px-4 py-2">Tipo</th>
            <th className="px-4 py-2">Depósito</th>
            <th className="px-4 py-2">Quantidade</th>
            <th className="px-4 py-2">De → Para</th>
            <th className="px-4 py-2">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{new Date(m.createdAt).toLocaleString('pt-BR')}</td>
              <td className="px-4 py-2">{MOVEMENT_LABEL[m.type]}</td>
              <td className="px-4 py-2">{m.warehouse.name}</td>
              <td className="px-4 py-2">{m.quantity}</td>
              <td className="px-4 py-2">
                {m.previousQuantity} → {m.newQuantity}
              </td>
              <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{m.reason ?? '—'}</td>
            </tr>
          ))}
          {movements.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-4 text-center text-slate-400 dark:text-slate-500">
                Nenhuma movimentação registrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  IN: 'Entrada',
  OUT: 'Saída',
  TRANSFER: 'Transferência',
  ADJUSTMENT: 'Ajuste',
  LOSS: 'Perda',
};

function AdjustStockForm({
  productId,
  warehouses,
  onDone,
}: {
  productId: string;
  warehouses: Warehouse[];
  onDone: () => void;
}) {
  const [warehouseId, setWarehouseId] = useState('');
  const [type, setType] = useState<'IN' | 'OUT' | 'ADJUSTMENT' | 'LOSS'>('IN');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) setWarehouseId(warehouses[0].id);
  }, [warehouses, warehouseId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/inventory/stock/adjust', {
        productId,
        warehouseId,
        type,
        quantity: Number(quantity),
        reason: reason || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível movimentar o estoque.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:grid-cols-4"
    >
      <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
        <option value="IN">Entrada</option>
        <option value="OUT">Saída</option>
        <option value="ADJUSTMENT">Ajuste (quantidade final)</option>
        <option value="LOSS">Perda</option>
      </select>
      <input
        className="input"
        type="number"
        step={1}
        min={0}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        required
      />
      <input className="input" placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={saving || !warehouseId}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Confirmar movimentação'}
        </button>
      </div>
    </form>
  );
}
