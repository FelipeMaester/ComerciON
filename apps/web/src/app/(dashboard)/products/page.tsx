'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import type { Category, Product } from '@/lib/types';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  async function load(searchTerm?: string, onlyLowStock?: boolean) {
    setLoading(true);
    setError(null);
    try {
      const data = onlyLowStock
        ? await api.get<Product[]>('/products/low-stock')
        : await api.get<Product[]>(`/products${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''}`);
      setProducts(data);
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
        <h1 className="text-xl font-semibold">Produtos</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
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
          <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
            Buscar
          </button>
        </form>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
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
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : (
        <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Marca</th>
              <th className="px-4 py-2">Preço</th>
              <th className="px-4 py-2">Estoque mín.</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                <td className="px-4 py-2 font-mono text-xs">{p.sku}</td>
                <td className="px-4 py-2">
                  <Link href={`/products/${p.id}`} className="text-slate-900 dark:text-slate-100 hover:underline">
                    {p.name}
                  </Link>
                  {p.vehicleApplication && (
                    <div className="text-xs text-slate-400 dark:text-slate-500">{p.vehicleApplication}</div>
                  )}
                </td>
                <td className="px-4 py-2">{p.brand ?? '—'}</td>
                <td className="px-4 py-2">R$ {Number(p.price).toFixed(2)}</td>
                <td className="px-4 py-2">{p.minStock}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400 dark:text-slate-500">
                  Nenhum produto encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
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
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:grid-cols-3"
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

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
