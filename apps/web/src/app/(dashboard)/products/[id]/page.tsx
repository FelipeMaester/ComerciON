'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import type { Product, StockMovementType, Warehouse } from '@/lib/types';

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
  const [error, setError] = useState<string | null>(null);
  const [showAdjustForm, setShowAdjustForm] = useState(false);

  async function load() {
    try {
      const [productData, movementsData] = await Promise.all([
        api.get<Product>(`/products/${params.id}`),
        api.get<Movement[]>(`/inventory/stock/products/${params.id}/movements`),
      ]);
      setProduct(productData);
      setMovements(movementsData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o produto.');
    }
  }

  useEffect(() => {
    load();
    api.get<Warehouse[]>('/warehouses').then(setWarehouses).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!product) return <p className="text-sm text-slate-500">Carregando…</p>;

  const totalStock = product.stockItems?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <div>
      <button onClick={() => router.push('/products')} className="mb-4 text-sm text-slate-500 hover:text-slate-900">
        ← Voltar
      </button>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <h1 className="mb-1 text-xl font-semibold">{product.name}</h1>
        <p className="mb-3 text-sm text-slate-400">
          SKU: {product.sku} {product.barcode && `· Código de barras: ${product.barcode}`}
        </p>
        <dl className="grid grid-cols-2 gap-2 text-sm text-slate-600 sm:grid-cols-4">
          <div>
            <dt className="text-slate-400">Marca</dt>
            <dd>{product.brand ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Aplicação</dt>
            <dd>{product.vehicleApplication ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Preço varejo</dt>
            <dd>R$ {Number(product.retailPrice).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Preço atacado</dt>
            <dd>R$ {Number(product.wholesalePrice).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Estoque total</dt>
            <dd className={totalStock < product.minStock ? 'font-medium text-red-600' : ''}>
              {totalStock} {totalStock < product.minStock && '(abaixo do mínimo)'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Estoque mínimo</dt>
            <dd>{product.minStock}</dd>
          </div>
        </dl>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium">Estoque por depósito</h2>
        <button
          onClick={() => setShowAdjustForm((v) => !v)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
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

      <table className="mb-6 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">Depósito</th>
            <th className="px-4 py-2">Quantidade</th>
          </tr>
        </thead>
        <tbody>
          {product.stockItems?.map((item) => (
            <tr key={item.id} className="border-t border-slate-100">
              <td className="px-4 py-2">{item.warehouse.name}</td>
              <td className="px-4 py-2">{item.quantity}</td>
            </tr>
          ))}
          {(!product.stockItems || product.stockItems.length === 0) && (
            <tr>
              <td colSpan={2} className="px-4 py-4 text-center text-slate-400">
                Sem estoque registrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h2 className="mb-3 text-lg font-medium">Histórico de movimentações</h2>
      <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
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
            <tr key={m.id} className="border-t border-slate-100">
              <td className="px-4 py-2 text-xs text-slate-500">{new Date(m.createdAt).toLocaleString('pt-BR')}</td>
              <td className="px-4 py-2">{MOVEMENT_LABEL[m.type]}</td>
              <td className="px-4 py-2">{m.warehouse.name}</td>
              <td className="px-4 py-2">{m.quantity}</td>
              <td className="px-4 py-2">
                {m.previousQuantity} → {m.newQuantity}
              </td>
              <td className="px-4 py-2 text-slate-500">{m.reason ?? '—'}</td>
            </tr>
          ))}
          {movements.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-4 text-center text-slate-400">
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
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-4"
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
        min={0}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        required
      />
      <input className="input" placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />

      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={saving || !warehouseId}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Confirmar movimentação'}
        </button>
      </div>
    </form>
  );
}
