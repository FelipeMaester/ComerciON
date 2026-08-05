// Sessão do cliente da loja — chaves de localStorage próprias deste app,
// completamente separadas das usadas pelo painel admin (apps/web). Mesma
// simplificação documentada lá: antes de produção real, migrar para cookies
// httpOnly via route handler do Next.

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const TOKENS_KEY = 'storefront.tokens';

export function getTokens(): Tokens | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(TOKENS_KEY);
  return raw ? (JSON.parse(raw) as Tokens) : null;
}

export function setTokens(tokens: Tokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  window.dispatchEvent(new Event('session-changed'));
}

export function clearSession(): void {
  localStorage.removeItem(TOKENS_KEY);
  window.dispatchEvent(new Event('session-changed'));
}
