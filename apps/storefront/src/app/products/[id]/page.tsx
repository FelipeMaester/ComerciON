'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { addToCart } from '@/lib/cart';
import { useIsLoggedIn } from '@/lib/hooks';
import type { EquivalentProduct, PublicProduct, Review } from '@/lib/types';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const loggedIn = useIsLoggedIn();
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [equivalents, setEquivalents] = useState<EquivalentProduct[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [productData, reviewsData, equivalentsData] = await Promise.all([
        api.get<PublicProduct>(`/storefront/products/${params.id}`),
        api.get<Review[]>(`/storefront/products/${params.id}/reviews`),
        api.get<EquivalentProduct[]>(`/storefront/products/${params.id}/equivalents`),
      ]);
      setProduct(productData);
      setReviews(reviewsData);
      setEquivalents(equivalentsData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o produto.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!product) return <p className="text-sm text-slate-500 dark:text-slate-400">Carregando…</p>;

  return (
    <div>
      <div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
          <div className="mb-1 text-xs text-slate-400 dark:text-slate-500">
            {product.brand} · {product.sku}
          </div>
          <h1 className="mb-2 text-2xl font-semibold">{product.name}</h1>
          {product.vehicleApplication && <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{product.vehicleApplication}</p>}
          {product.description && <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{product.description}</p>}
          {product.averageRating !== null && product.averageRating !== undefined && (
            <p className="mb-4 text-sm text-amber-600 dark:text-amber-400">
              ★ {product.averageRating.toFixed(1)} ({product.reviewsCount} avaliações)
            </p>
          )}

          <div className="mb-4 text-3xl font-semibold">R$ {Number(product.price).toFixed(2)}</div>
          <p className={`mb-4 text-sm ${product.inStock ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
            {product.inStock ? 'Em estoque' : 'Esgotado'}
          </p>

          <div className="flex items-center gap-3">
            <input
              type="number"
              step={1}
              min={1}
              className="input w-20"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            />
            <button
              onClick={() => {
                addToCart(
                  { productId: product.id, sku: product.sku, name: product.name, unitPrice: Number(product.price) },
                  quantity,
                );
                setAdded(true);
                setTimeout(() => setAdded(false), 2000);
              }}
              disabled={!product.inStock}
              className="btn-primary flex-1"
            >
              {added ? 'Adicionado ✓' : 'Adicionar ao carrinho'}
            </button>
          </div>
        </div>

        <ReviewsSection productId={product.id} reviews={reviews} loggedIn={loggedIn} onReviewed={load} />
      </div>

      {equivalents.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-medium">Peças equivalentes</h2>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Outras marcas que servem no lugar desta peça.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {equivalents.map((eq) => (
              <Link
                key={eq.id}
                href={`/products/${eq.id}`}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm hover:border-slate-300 dark:hover:border-slate-600"
              >
                <div className="mb-1 text-xs text-slate-400 dark:text-slate-500">{eq.brand ?? '—'}</div>
                <div className="mb-1 font-medium">{eq.name}</div>
                <div className="text-slate-500 dark:text-slate-400">R$ {Number(eq.price).toFixed(2)}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewsSection({
  productId,
  reviews,
  loggedIn,
  onReviewed,
}: {
  productId: string;
  reviews: Review[];
  loggedIn: boolean;
  onReviewed: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post(`/storefront/products/${productId}/reviews`, { rating, comment: comment || undefined });
      setComment('');
      onReviewed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar sua avaliação.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-medium">Avaliações</h2>

      {loggedIn ? (
        <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <label className="mb-2 block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Sua nota</span>
            <select className="input" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} estrela{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
          <textarea
            className="input mb-2"
            placeholder="Conte sua experiência (opcional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {error && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={saving} className="btn-secondary">
            {saving ? 'Enviando…' : 'Enviar avaliação'}
          </button>
        </form>
      ) : (
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Entre na sua conta para avaliar este produto.</p>
      )}

      <ul className="space-y-3">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">{r.customer.name}</span>
              <span className="text-amber-600 dark:text-amber-400">{'★'.repeat(r.rating)}</span>
            </div>
            {r.comment && <p className="text-slate-600 dark:text-slate-300">{r.comment}</p>}
          </li>
        ))}
        {reviews.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">Nenhuma avaliação ainda.</p>}
      </ul>
    </div>
  );
}
