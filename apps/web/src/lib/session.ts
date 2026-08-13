/**
 * Sessão do painel.
 *
 * O token NÃO mora aqui. Ele vai e volta em cookie httpOnly, que o JavaScript
 * desta página não consegue ler — é justamente o ponto: um XSS não tem como
 * copiar a sessão e usá-la de outra máquina. O que sobra no localStorage é só
 * o que não é segredo.
 *
 * O slug da loja não é segredo (vai em header em toda requisição e aparece no
 * link público de orçamento). O papel do usuário também não: serve só para
 * decidir o que DESENHAR — o backend revalida permissão em toda rota, então
 * adulterar este valor não abre nada, só mostra um menu que vai dar 403.
 */

const TENANT_KEY = 'erp.tenantSlug';
const ROLE_KEY = 'erp.role';

export function getTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TENANT_KEY);
}

export function setTenantSlug(slug: string): void {
  localStorage.setItem(TENANT_KEY, slug);
}

export function getCurrentUserRole(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ROLE_KEY);
}

export function setCurrentUserRole(role: string): void {
  localStorage.setItem(ROLE_KEY, role);
}

/**
 * Se existe sessão neste navegador.
 *
 * É um palpite, não uma verdade: o cookie é invisível daqui, então o que se
 * checa é a marca deixada no login. Serve para não piscar a tela do painel
 * para quem nunca entrou; quem decide de fato é a API, com 401.
 */
export function pareceLogado(): boolean {
  return getCurrentUserRole() !== null;
}

export function clearSession(): void {
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(TENANT_KEY);
}
