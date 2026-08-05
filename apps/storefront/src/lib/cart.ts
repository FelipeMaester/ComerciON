// Carrinho fica só no navegador (localStorage) até o checkout — não existe
// carrinho no backend. Um evento customizado dá reatividade dentro da MESMA
// aba (o evento nativo 'storage' só dispara em outras abas).

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

const CART_KEY = 'storefront.cart';
const CART_EVENT = 'cart-changed';

function readCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(CART_KEY);
  return raw ? (JSON.parse(raw) as CartItem[]) : [];
}

function writeCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CART_EVENT));
}

export function getCart(): CartItem[] {
  return readCart();
}

export function addToCart(item: Omit<CartItem, 'quantity'>, quantity = 1): void {
  const items = readCart();
  const existing = items.find((i) => i.productId === item.productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    items.push({ ...item, quantity });
  }
  writeCart(items);
}

export function updateCartQuantity(productId: string, quantity: number): void {
  writeCart(readCart().map((i) => (i.productId === productId ? { ...i, quantity: Math.max(1, quantity) } : i)));
}

export function removeFromCart(productId: string): void {
  writeCart(readCart().filter((i) => i.productId !== productId));
}

export function clearCart(): void {
  writeCart([]);
}

export function subscribeCart(callback: () => void): () => void {
  window.addEventListener(CART_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CART_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}
