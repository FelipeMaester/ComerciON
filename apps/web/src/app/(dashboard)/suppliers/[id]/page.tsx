'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import type { Paginated, Product, Supplier } from '@/lib/types';

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);

  async function load() {
    try {
      const data = await api.get<Supplier>(`/suppliers/${params.id}`);
      setSupplier(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o fornecedor.');
    }
  }

  useEffect(() => {
    load();
    api.get<Paginated<Product>>('/products?pageSize=100').then((d) => setProducts(d.items)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!supplier) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>;

  return (
    <div>
      <button onClick={() => router.push('/suppliers')} className="mb-4 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
        ← Voltar
      </button>

      <div className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h1 className="mb-2 text-xl font-semibold">{supplier.name}</h1>
        <dl className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3">
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Documento</dt>
            <dd>{supplier.document ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">E-mail</dt>
            <dd>{supplier.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Telefone</dt>
            <dd>{supplier.phone ?? '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium">Produtos fornecidos</h2>
        <button
          onClick={() => setShowLinkForm((v) => !v)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          {showLinkForm ? 'Cancelar' : 'Vincular produto'}
        </button>
      </div>

      {showLinkForm && (
        <LinkProductForm
          supplierId={supplier.id}
          products={products}
          onDone={() => {
            setShowLinkForm(false);
            load();
          }}
        />
      )}

      <div className="w-full overflow-x-auto">
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">Produto</th>
              <th className="px-4 py-2">SKU do fornecedor</th>
              <th className="px-4 py-2">Custo</th>
              <th className="px-4 py-2">Preferencial</th>
            </tr>
          </thead>
          <tbody>
            {supplier.productLinks?.map((link) => (
              <tr key={link.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2">{link.product.name}</td>
                <td className="px-4 py-2">{link.supplierSku ?? '—'}</td>
                <td className="px-4 py-2">R$ {Number(link.cost).toFixed(2)}</td>
                <td className="px-4 py-2">{link.isPreferred ? 'Sim' : 'Não'}</td>
              </tr>
            ))}
            {(!supplier.productLinks || supplier.productLinks.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-slate-400 dark:text-slate-500">
                  Nenhum produto vinculado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LinkProductForm({
  supplierId,
  products,
  onDone,
}: {
  supplierId: string;
  products: Product[];
  onDone: () => void;
}) {
  const [productId, setProductId] = useState('');
  const [supplierSku, setSupplierSku] = useState('');
  const [cost, setCost] = useState('0');
  const [isPreferred, setIsPreferred] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!productId && products.length > 0) setProductId(products[0].id);
  }, [products, productId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(`/suppliers/${supplierId}/products`, {
        productId,
        supplierSku: supplierSku || undefined,
        cost: Number(cost),
        isPreferred,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível vincular o produto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:grid-cols-4"
    >
      <select className="input sm:col-span-2" value={productId} onChange={(e) => setProductId(e.target.value)}>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.sku} — {p.name}
          </option>
        ))}
      </select>
      <input
        className="input"
        placeholder="SKU do fornecedor (opcional)"
        value={supplierSku}
        onChange={(e) => setSupplierSku(e.target.value)}
      />
      <input
        className="input"
        type="number"
        step="0.01"
        placeholder="Custo"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
      />
      <label className="col-span-full flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={isPreferred} onChange={(e) => setIsPreferred(e.target.checked)} />
        Fornecedor preferencial para este produto
      </label>

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={saving || !productId}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Vincular'}
        </button>
      </div>
    </form>
  );
}
