'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import type { Paginated, Product, ProductEquivalent, StockMovementType, Warehouse } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

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
    api.get<Paginated<Product>>('/products?pageSize=100').then((d) => setAllProducts(d.items)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!product) return <p className="text-sm text-suave">Carregando…</p>;

  const totalStock = product.stockItems?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <div>
      <button onClick={() => router.push('/products')} className="mb-4 text-sm text-suave hover:text-texto">
        ← Voltar
      </button>

      <div className="card mb-6 p-4">
        <h1 className="mb-1 titulo-pagina">{product.name}</h1>
        <p className="mb-3 text-sm text-tenue">
          SKU: {product.sku} {product.barcode && `· Código de barras: ${product.barcode}`}
        </p>
        <dl className="grid grid-cols-2 gap-2 text-sm text-suave sm:grid-cols-4">
          <div>
            <dt className="text-tenue">Marca</dt>
            <dd>{product.brand ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-tenue">Aplicação</dt>
            <dd>{product.vehicleApplication ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-tenue">Preço</dt>
            <dd>{formatarMoeda(Number(product.price))}</dd>
          </div>
          <div>
            <dt className="text-tenue">Estoque total</dt>
            <dd className={totalStock < product.minStock ? 'font-medium text-red-600 dark:text-red-400' : ''}>
              {totalStock} {totalStock < product.minStock && '(abaixo do mínimo)'}
            </dd>
          </div>
          <div>
            <dt className="text-tenue">Estoque mínimo</dt>
            <dd>{product.minStock}</dd>
          </div>
        </dl>
      </div>

      <DadosFiscaisForm product={product} onSaved={load} />

      <div className="card mb-6 p-4">
        <h2 className="mb-3 text-lg font-medium">Peças equivalentes/similares</h2>
        <p className="mb-3 text-xs text-tenue">
          Outras peças que servem no lugar desta (marcas diferentes, mesma aplicação) — servem de alternativa quando a peça pedida está em falta.
        </p>

        {equivalents.length > 0 && (
          <ul className="mb-3 space-y-1">
            {equivalents.map((eq) => (
              <li
                key={eq.id}
                className="flex items-center justify-between rounded-lg bg-realce px-3 py-1.5 text-sm text-texto"
              >
                <Link href={`/products/${eq.id}`} className="hover:underline">
                  {eq.name} · {eq.sku} {eq.brand && `· ${eq.brand}`} — {formatarMoeda(Number(eq.price))}
                </Link>
                <button
                  onClick={() => removeEquivalent(eq.id)}
                  className="text-tenue hover:text-red-600"
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
          className="btn-secondary btn-sm"
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

      <div className="w-full overflow-x-auto">
        <table className="tabela card mb-6">
          <thead>
            <tr>
              <th>Depósito</th>
              <th>Quantidade</th>
            </tr>
          </thead>
          <tbody>
            {product.stockItems?.map((item) => (
              <tr key={item.id}>
                <td>{item.warehouse.name}</td>
                <td>{item.quantity}</td>
              </tr>
            ))}
            {(!product.stockItems || product.stockItems.length === 0) && (
              <tr>
                <td colSpan={2} className="px-4 py-4 text-center text-tenue">
                  Sem estoque registrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-lg font-medium">Histórico de movimentações</h2>
      <div className="w-full overflow-x-auto">
        <table className="tabela card">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Depósito</th>
              <th>Quantidade</th>
              <th>De → Para</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td className="text-xs text-suave">{new Date(m.createdAt).toLocaleString('pt-BR')}</td>
                <td>{MOVEMENT_LABEL[m.type]}</td>
                <td>{m.warehouse.name}</td>
                <td>{m.quantity}</td>
                <td>
                  {m.previousQuantity} → {m.newQuantity}
                </td>
                <td className="text-suave">{m.reason ?? '—'}</td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-tenue">
                  Nenhuma movimentação registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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

/**
 * Dados fiscais do produto.
 *
 * Estes campos existiam no banco desde o começo e o módulo fiscal sempre os
 * exigiu, mas nenhuma tela (nem a API) os aceitava — então a emissão de nota
 * era impossível: o produto nascia sem NCM e a SEFAZ recusava. Aqui é onde
 * quem já tem catálogo cadastrado completa o que falta.
 */
function DadosFiscaisForm({ product, onSaved }: { product: Product; onSaved: () => void }) {
  const [ncm, setNcm] = useState(product.ncm ?? '');
  const [cfop, setCfop] = useState(product.cfop ?? '');
  const [icmsCst, setIcmsCst] = useState(product.icmsCst ?? '');
  const [icmsOrigem, setIcmsOrigem] = useState(product.icmsOrigem ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [salvo, setSalvo] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSalvo(false);
    try {
      const digitos = (v: string) => v.replace(/\D/g, '');
      await api.patch(`/products/${product.id}`, {
        ncm: digitos(ncm) || undefined,
        cfop: digitos(cfop) || undefined,
        icmsCst: digitos(icmsCst) || undefined,
        icmsOrigem: digitos(icmsOrigem) || undefined,
      });
      setSalvo(true);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar os dados fiscais.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card mb-6 p-4"
    >
      <h2 className="mb-1 text-lg font-medium">Dados fiscais</h2>
      <p className="mb-3 text-xs text-tenue">
        Necessários para emitir NF-e/NFC-e desta peça. Só o NCM é obrigatório — CFOP, CST e origem, em branco, usam o
        padrão de venda no estado para Simples Nacional.
      </p>

      {!product.ncm && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Sem o NCM, a nota fiscal desta peça é recusada na emissão.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input className="input" inputMode="numeric" maxLength={10} placeholder="NCM (8 dígitos)" value={ncm} onChange={(e) => setNcm(e.target.value)} />
        <input className="input" inputMode="numeric" maxLength={4} placeholder="CFOP (ex: 5102)" value={cfop} onChange={(e) => setCfop(e.target.value)} />
        <input className="input" inputMode="numeric" maxLength={3} placeholder="CST/CSOSN (ex: 102)" value={icmsCst} onChange={(e) => setIcmsCst(e.target.value)} />
        <input className="input" inputMode="numeric" maxLength={1} placeholder="Origem (0 = nacional)" value={icmsOrigem} onChange={(e) => setIcmsOrigem(e.target.value)} />
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {salvo && !error && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">Dados fiscais salvos.</p>}

      <button
        type="submit"
        disabled={saving}
        className="btn-primary mt-3"
      >
        {saving ? 'Salvando…' : 'Salvar dados fiscais'}
      </button>
    </form>
  );
}

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
      className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-4"
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
          className="btn-primary"
        >
          {saving ? 'Salvando…' : 'Confirmar movimentação'}
        </button>
      </div>
    </form>
  );
}
