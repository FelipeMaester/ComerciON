'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { addToCart } from '@/lib/cart';
import { useBranding } from '@/lib/hooks';
import type { Category, PublicProduct } from '@/lib/types';

export default function HomePage() {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const branding = useBranding();

  async function load(searchTerm?: string, category?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (category) params.set('categoryId', category);
      const data = await api.get<PublicProduct[]>(`/storefront/products?${params.toString()}`);
      setProducts(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    api.get<Category[]>('/storefront/categories').then(setCategories);
  }, []);

  return (
    <div>
      {branding?.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.bannerUrl}
          alt=""
          className="mb-6 h-48 w-full rounded-lg object-cover sm:h-64"
          style={{ objectPosition: branding.bannerPosition ?? '50% 50%' }}
        />
      )}

      <div className="mb-8">
        <h1 className="mb-1 text-2xl font-semibold">{branding?.name || 'Catálogo de peças'}</h1>
        {branding?.tagline && <p className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-300">{branding.tagline}</p>}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {branding?.description || 'Radiadores, defletores, condensadores e ventoinhas com entrega rápida.'}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(search, categoryId);
          }}
          className="flex gap-2"
        >
          <input
            className="input max-w-xs"
            placeholder="Buscar produto, marca ou SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn-secondary">
            Buscar
          </button>
        </form>
        <select
          className="input max-w-xs"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            load(search, e.target.value);
          }}
        >
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div key={p.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <Link href={`/products/${p.id}`} className="block">
                <div className="mb-1 text-xs text-slate-400 dark:text-slate-500">
                  {p.brand} · {p.sku}
                </div>
                <h2 className="mb-1 font-medium hover:underline">{p.name}</h2>
                {p.vehicleApplication && <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{p.vehicleApplication}</p>}
              </Link>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-lg font-semibold">R$ {Number(p.retailPrice).toFixed(2)}</span>
                <span className={p.inStock ? 'text-xs text-emerald-600 dark:text-emerald-400' : 'text-xs text-red-500'}>
                  {p.inStock ? 'Em estoque' : 'Esgotado'}
                </span>
              </div>
              <button
                onClick={() =>
                  addToCart({ productId: p.id, sku: p.sku, name: p.name, unitPrice: Number(p.retailPrice) })
                }
                disabled={!p.inStock}
                className="btn-primary mt-3 w-full"
                style={branding?.primaryColor ? { backgroundColor: branding.primaryColor, color: '#fff' } : undefined}
              >
                Adicionar ao carrinho
              </button>
            </div>
          ))}
          {products.length === 0 && <p className="col-span-full text-center text-slate-400 dark:text-slate-500">Nenhum produto encontrado.</p>}
        </div>
      )}
    </div>
  );
}
