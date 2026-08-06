'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useBranding, useCart, useIsLoggedIn } from '@/lib/hooks';
import { clearSession } from '@/lib/session';
import { ThemeToggle } from './ThemeToggle';

// Debounce simples: evita mandar uma requisição a cada clique de +/- no
// carrinho, sincroniza só depois de ~1s sem mudanças.
const CART_SYNC_DEBOUNCE_MS = 1000;

export function Header() {
  const cart = useCart();
  const loggedIn = useIsLoggedIn();
  const branding = useBranding();
  const router = useRouter();
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const syncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manda uma cópia mínima do carrinho para o servidor — usada só pela
  // automação de recuperação de carrinho abandonado (Fase 5). O carrinho em
  // si continua vivendo no localStorage; isso é só um espelho para o job de
  // lembrete conseguir enxergar o que o cliente deixou pra trás.
  useEffect(() => {
    if (!loggedIn) return;
    if (syncTimeout.current) clearTimeout(syncTimeout.current);
    syncTimeout.current = setTimeout(() => {
      api
        .post('/storefront/cart/sync', {
          items: cart.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity })),
        })
        .catch(() => {
          // Sincronização de carrinho é best-effort — uma falha aqui não deve
          // atrapalhar a navegação do cliente.
        });
    }, CART_SYNC_DEBOUNCE_MS);
    return () => {
      if (syncTimeout.current) clearTimeout(syncTimeout.current);
    };
  }, [cart, loggedIn]);

  function handleLogout() {
    clearSession();
    router.push('/');
  }

  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          {branding?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt=""
              className="h-8 w-8 rounded object-cover"
              style={{ objectPosition: branding.logoPosition ?? '50% 50%' }}
            />
          )}
          {branding?.name ?? 'Distribuidora Demo'}
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100">
            Catálogo
          </Link>
          <Link href="/cart" className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100">
            Carrinho
            {itemCount > 0 && (
              <span className="ml-1 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white dark:bg-slate-100 dark:text-slate-900">
                {itemCount}
              </span>
            )}
          </Link>
          {loggedIn ? (
            <>
              <Link href="/account" className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100">
                Minha conta
              </Link>
              <button onClick={handleLogout} className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100">
                Sair
              </button>
            </>
          ) : (
            <Link href="/login" className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100">
              Entrar
            </Link>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
