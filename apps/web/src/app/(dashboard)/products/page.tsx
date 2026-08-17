'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { Pagination } from '@/components/Pagination';
import type { Category, Paginated, Product } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pageInfo, setPageInfo] = useState<Paginated<Product> | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  async function load(searchTerm?: string, onlyLowStock?: boolean, page = 1) {
    setLoading(true);
    setError(null);
    try {
      if (onlyLowStock) {
        // "Abaixo do mínimo" é uma lista curta por natureza (se for longa, o
        // problema é de compras, não de paginação) — segue devolvendo array.
        setProducts(await api.get<Product[]>('/products/low-stock'));
        setPageInfo(null);
        return;
      }
      const params = new URLSearchParams({ page: String(page) });
      if (searchTerm) params.set('search', searchTerm);
      const data = await api.get<Paginated<Product>>(`/products?${params}`);
      setProducts(data.items);
      setPageInfo(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os produtos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    api.get<Category[]>('/categories').then(setCategories).catch(() => undefined);
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="titulo-pagina">Produtos</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary"
        >
          {showForm ? 'Cancelar' : 'Novo produto'}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(search, lowStockOnly);
          }}
          className="flex gap-2"
        >
          <input
            className="input max-w-xs"
            placeholder="Buscar por nome, SKU ou código de barras..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn-secondary">
            Buscar
          </button>
        </form>
        <label className="flex items-center gap-2 text-sm text-suave">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => {
              setLowStockOnly(e.target.checked);
              load(search, e.target.checked);
            }}
          />
          Só estoque baixo
        </label>
      </div>

      {showForm && (
        <CreateProductForm
          categories={categories}
          onCreated={() => {
            setShowForm(false);
            load(search, lowStockOnly);
          }}
        />
      )}

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-suave">Carregando…</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="tabela card">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nome</th>
                <th>Marca</th>
                <th className="num">Preço</th>
                <th className="num">Estoque mín.</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td>
                    <Link href={`/products/${p.id}`} className="text-texto hover:underline">
                      {p.name}
                    </Link>
                    {p.vehicleApplication && (
                      <div className="text-xs text-tenue">{p.vehicleApplication}</div>
                    )}
                  </td>
                  <td>{p.brand ?? '—'}</td>
                  <td className="num font-medium">{formatarMoeda(Number(p.price))}</td>
                  <td className="num text-suave">{p.minStock}</td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-tenue">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination data={pageInfo} onPageChange={(p) => load(search, false, p)} itemLabel="produtos" />
    </div>
  );
}

function CreateProductForm({ categories, onCreated }: { categories: Category[]; onCreated: () => void }) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [vehicleApplication, setVehicleApplication] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [price, setPrice] = useState('');
  const [minStock, setMinStock] = useState('');
  const [ncm, setNcm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/products', {
        sku,
        name,
        brand: brand || undefined,
        vehicleApplication: vehicleApplication || undefined,
        categoryId: categoryId || undefined,
        costPrice: Number(costPrice),
        price: Number(price),
        minStock: Number(minStock),
        // Sem NCM a SEFAZ não aceita a nota, e o produto ficava impossível de
        // faturar. Opcional aqui: quem não emite nota não precisa preencher, e
        // quem precisa pode completar depois na tela do produto.
        ncm: ncm.replace(/\D/g, '') || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o produto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-3"
    >
      <input className="input" placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} required />
      <input
        className="input sm:col-span-2"
        placeholder="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input className="input" placeholder="Marca" value={brand} onChange={(e) => setBrand(e.target.value)} />
      <input
        className="input sm:col-span-2"
        placeholder='Aplicação de veículo (ex: "Gol G5/G6 1.0/1.6 2008-2014")'
        value={vehicleApplication}
        onChange={(e) => setVehicleApplication(e.target.value)}
      />
      <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">Sem categoria</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        className="input"
        type="number"
        step="0.01"
        placeholder="Preço de custo"
        value={costPrice}
        onChange={(e) => setCostPrice(e.target.value)}
      />
      <input
        className="input"
        type="number"
        step="0.01"
        placeholder="Preço de venda"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <input
        className="input"
        type="number"
        step={1}
        min={0}
        placeholder="Estoque mínimo"
        value={minStock}
        onChange={(e) => setMinStock(e.target.value)}
      />
      <input
        className="input"
        inputMode="numeric"
        maxLength={10}
        placeholder="NCM (8 dígitos, para nota fiscal)"
        value={ncm}
        onChange={(e) => setNcm(e.target.value)}
      />

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
