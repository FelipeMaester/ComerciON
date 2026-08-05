'use client';

import { useEffect, useState } from 'react';
import { CartItem, getCart, subscribeCart } from './cart';
import { getTokens } from './session';

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
