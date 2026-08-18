'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoFicha } from '@/components/Carregando';
import type { Paginated, Product, Supplier } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

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
  if (!supplier) return <CarregandoFicha />;

  return (
    <div>
      <button onClick={() => router.push('/suppliers')} className="mb-4 text-sm text-suave hover:text-texto">
        ← Voltar
      </button>

      <div className="card mb-6 p-4">
        <h1 className="mb-2 titulo-pagina">{supplier.name}</h1>
        <dl className="grid grid-cols-2 gap-2 text-sm text-suave sm:grid-cols-3">
          <div>
            <dt className="text-tenue">Documento</dt>
            <dd>{supplier.document ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-tenue">E-mail</dt>
            <dd>{supplier.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-tenue">Telefone</dt>
            <dd>{supplier.phone ?? '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium">Produtos fornecidos</h2>
        <button
          onClick={() => setShowLinkForm((v) => !v)}
          className="btn-secondary btn-sm"
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
        <table className="tabela card">
          <thead>
            <tr>
              <th>Produto</th>
              <th>SKU do fornecedor</th>
              <th>Custo</th>
              <th>Preferencial</th>
            </tr>
          </thead>
          <tbody>
            {supplier.productLinks?.map((link) => (
              <tr key={link.id}>
                <td>{link.product.name}</td>
                <td>{link.supplierSku ?? '—'}</td>
                <td>{formatarMoeda(Number(link.cost))}</td>
                <td>{link.isPreferred ? 'Sim' : 'Não'}</td>
              </tr>
            ))}
            {(!supplier.productLinks || supplier.productLinks.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-tenue">
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
      className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-4"
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
      <label className="col-span-full flex items-center gap-2 text-sm text-suave">
        <input type="checkbox" checked={isPreferred} onChange={(e) => setIsPreferred(e.target.checked)} />
        Fornecedor preferencial para este produto
      </label>

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={saving || !productId}
          className="btn-primary"
        >
          {saving ? 'Salvando…' : 'Vincular'}
        </button>
      </div>
    </form>
  );
}
