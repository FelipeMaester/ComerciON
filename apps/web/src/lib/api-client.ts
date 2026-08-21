import { clearSession, getTenantSlug } from './session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * `credentials: 'include'` em toda chamada: a sessão vive num cookie httpOnly
 * emitido pela API, e sem isto o navegador não o envia numa requisição para
 * outra origem (painel na 3000, API na 3001).
 *
 * Do outro lado, a API precisa responder com CORS de origem específica e
 * `credentials: true` — com `origin: '*'` o navegador recusa a resposta.
 */
const COM_COOKIE: RequestInit = { credentials: 'include' };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Renova a sessão. Não recebe nem devolve token: o refresh vai no cookie e a
 * resposta traz o par novo pelo mesmo caminho.
 */
async function tryRefresh(): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/auth/refresh`, {
    ...COM_COOKIE,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  return res.ok;
}

async function request<T>(path: string, options: RequestInit = {}, allowRetry = true): Promise<T> {
  const tenantSlug = getTenantSlug();

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (tenantSlug) headers.set('x-tenant-slug', tenantSlug);

  const res = await fetch(`${API_URL}/api${path}`, { ...COM_COOKIE, ...options, headers });

  if (res.status === 401 && allowRetry) {
    if (await tryRefresh()) {
      return request<T>(path, options, false);
    }
    clearSession();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? `Erro ${res.status}`);
  }

  // 204 não tem corpo por definição. Mas o Nest também responde 200 com corpo
  // VAZIO quando o handler devolve null (ex.: GET /cash/current sem caixa
  // aberto) — e nesse caso res.json() estoura "Unexpected end of JSON input",
  // que chegava na tela como um "não foi possível carregar" genérico. Ler como
  // texto e só então parsear cobre os dois casos.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (text.length === 0) return null as T;
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  // DELETE aceita corpo: a exclusão de loja exige o identificador repetido para
  // confirmar, e ele não pode viajar na URL — endereço se monta à mão, se
  // repete do histórico e vaza em log de servidor.
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
};

/** Baixa um arquivo binário (CSV/PDF de relatórios) disparando o download no navegador. */
export async function downloadFile(path: string, filename: string, allowRetry = true): Promise<void> {
  const tenantSlug = getTenantSlug();

  const headers = new Headers();
  if (tenantSlug) headers.set('x-tenant-slug', tenantSlug);

  const res = await fetch(`${API_URL}/api${path}`, { ...COM_COOKIE, headers });

  if (res.status === 401 && allowRetry) {
    if (await tryRefresh()) return downloadFile(path, filename, false);
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
