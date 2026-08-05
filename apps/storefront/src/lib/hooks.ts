'use client';

import { useEffect, useState } from 'react';
import { api } from './api-client';
import { CartItem, getCart, subscribeCart } from './cart';
import { getTokens } from './session';
import type { TenantBranding } from './types';

// Cache em módulo: Header e a home montam ao mesmo tempo e os dois
// precisam da marca do tenant — sem isso disparariam duas requisições
// idênticas toda vez que a página carrega.
let brandingCache: TenantBranding | null = null;
let brandingPromise: Promise<TenantBranding> | null = null;

function loadBranding(): Promise<TenantBranding> {
  if (brandingCache) return Promise.resolve(brandingCache);
  if (!brandingPromise) {
    brandingPromise = api.get<TenantBranding>('/storefront/branding').then((data) => {
      brandingCache = data;
      return data;
    });
  }
  return brandingPromise;
}

export function useBranding(): TenantBranding | null {
  const [branding, setBranding] = useState<TenantBranding | null>(brandingCache);

  useEffect(() => {
    let active = true;
    loadBranding()
      .then((data) => {
        if (active) setBranding(data);
      })
      .catch(() => {
        // Loja continua funcionando sem marca personalizada (fallback nos componentes).
      });
    return () => {
      active = false;
    };
  }, []);

  return branding;
}

export function useCart(): CartItem[] {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(getCart());
    return subscribeCart(() => setItems(getCart()));
  }, []);

  return items;
}

export function useIsLoggedIn(): boolean {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const check = () => setLoggedIn(Boolean(getTokens()));
    check();
    window.addEventListener('session-changed', check);
    return () => window.removeEventListener('session-changed', check);
  }, []);

  return loggedIn;
}
