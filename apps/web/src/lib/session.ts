// Armazenamento de sessão simplificado para a Fase 0 (localStorage).
// Antes de ir para produção real: migrar para cookies httpOnly emitidos por
// route handlers do Next (proxy para a API), evitando expor tokens a XSS.

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const TENANT_KEY = 'erp.tenantSlug';
const TOKENS_KEY = 'erp.tokens';

export function getTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TENANT_KEY);
}

export function setTenantSlug(slug: string): void {
  localStorage.setItem(TENANT_KEY, slug);
}

export function getTokens(): Tokens | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(TOKENS_KEY);
  return raw ? (JSON.parse(raw) as Tokens) : null;
}

export function setTokens(tokens: Tokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function clearSession(): void {
  localStorage.removeItem(TOKENS_KEY);
  localStorage.removeItem(TENANT_KEY);
}

/** Lê o "role" direto do JWT (sem round-trip ao servidor) — só para decidir o que mostrar na UI; o backend sempre revalida. */
export function getCurrentUserRole(): string | null {
  const tokens = getTokens();
  if (!tokens?.accessToken) return null;
  try {
    const payload = JSON.parse(atob(tokens.accessToken.split('.')[1]));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}
