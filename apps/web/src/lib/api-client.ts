import { clearSession, getTenantSlug, getTokens, setTokens } from './session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function tryRefresh(refreshToken: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return true;
}

async function request<T>(path: string, options: RequestInit = {}, allowRetry = true): Promise<T> {
  const tokens = getTokens();
  const tenantSlug = getTenantSlug();

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (tenantSlug) headers.set('x-tenant-slug', tenantSlug);
  if (tokens?.accessToken) headers.set('Authorization', `Bearer ${tokens.accessToken}`);

  const res = await fetch(`${API_URL}/api${path}`, { ...options, headers });

  if (res.status === 401 && allowRetry && tokens?.refreshToken) {
    const refreshed = await tryRefresh(tokens.refreshToken);
    if (refreshed) {
      return request<T>(path, options, false);
    }
    clearSession();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? `Erro ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
};

/** Baixa um arquivo binário (CSV/PDF de relatórios) disparando o download no navegador. */
export async function downloadFile(path: string, filename: string, allowRetry = true): Promise<void> {
  const tokens = getTokens();
  const tenantSlug = getTenantSlug();

  const headers = new Headers();
  if (tenantSlug) headers.set('x-tenant-slug', tenantSlug);
  if (tokens?.accessToken) headers.set('Authorization', `Bearer ${tokens.accessToken}`);

  const res = await fetch(`${API_URL}/api${path}`, { headers });

  if (res.status === 401 && allowRetry && tokens?.refreshToken) {
    const refreshed = await tryRefresh(tokens.refreshToken);
    if (refreshed) return downloadFile(path, filename, false);
    clearSession();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? `Erro ${res.status}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
