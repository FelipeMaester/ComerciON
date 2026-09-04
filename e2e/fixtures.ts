import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

/** Senha usada em todas as lojas de teste. Ambiente descartável. */
export const SENHA = 'TesteE2E123';

export interface Loja {
  slug: string;
  nome: string;
  email: string;
  senha: string;
  accessToken: string;
}

/**
 * Cria uma loja nova, com slug único, pela API.
 *
 * É o que dá isolamento: o tenant-scoping do Prisma garante que um teste não
 * enxerga os dados de outro, então a suíte pode rodar contra o mesmo banco de
 * desenvolvimento sem sujar nada nem depender de ordem de execução.
 */
export async function criarLoja(request: APIRequestContext, plano = 'premium'): Promise<Loja> {
  const sufixo = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const slug = `e2e-${sufixo}`;
  const email = `dono@${sufixo}.teste`;

  const resposta = await request.post(`${API_URL}/api/auth/register-tenant`, {
    data: {
      tenantName: `Loja E2E ${sufixo}`,
      tenantSlug: slug,
      adminName: 'Dono E2E',
      adminEmail: email,
      adminPassword: SENHA,
      // Premium por padrão: sem isso a loja nasce em Trial e cada teste de
      // módulo pago (fiscal, logística, automações) bateria em 403. O gate
      // de plano tem teste próprio, em plano.spec.ts.
      planKey: plano,
    },
  });

  if (!resposta.ok()) {
    throw new Error(`Não foi possível criar a loja de teste: ${resposta.status()} ${await resposta.text()}`);
  }

  const corpo = await resposta.json();
  return { slug, nome: corpo.tenant.name, email, senha: SENHA, accessToken: corpo.accessToken };
}

/** Chamada autenticada à API, para preparar dados sem passar pela interface. */
export async function api(
  request: APIRequestContext,
  loja: Loja,
  metodo: 'get' | 'post' | 'patch',
  caminho: string,
  data?: unknown,
) {
  const resposta = await request[metodo](`${API_URL}/api${caminho}`, {
    headers: { Authorization: `Bearer ${loja.accessToken}`, 'x-tenant-slug': loja.slug },
    ...(data ? { data } : {}),
  });
  if (!resposta.ok()) {
    throw new Error(`${metodo.toUpperCase()} ${caminho} falhou: ${resposta.status()} ${await resposta.text()}`);
  }
  return resposta.json();
}

/**
 * Injeta a sessão no navegador ANTES da página carregar.
 *
 * Não passa pela tela de login de propósito: fazer isso em todo teste
 * transformaria cada um num teste de login disfarçado, e mascararia onde a
 * falha realmente aconteceu. O login pela interface tem teste próprio.
 *
 * A sessão em si são os dois cookies httpOnly que a API emite — por isso
 * `addCookies`, e não localStorage: é assim que o navegador de verdade guarda.
 * O que vai para o localStorage é apenas o que o painel guarda lá de fato: o
 * slug da loja e o papel do usuário, nenhum dos dois secreto.
 *
 * ATENÇÃO: `addInitScript` roda a cada carregamento de página. Um teste que
 * faça logout e use este fixture veria a marca de sessão voltar sozinha no
 * /login, e passaria a medir o fixture em vez do sistema — foi o que
 * aconteceu uma vez. Por isso o teste de logout entra pela tela.
 */
export async function entrarComo(
  page: Page,
  loja: Loja,
  tokens: { accessToken: string; refreshToken: string },
  papel: 'ADMIN' | 'SALES' | 'FINANCE' | 'INVENTORY' | 'SUPPORT' = 'ADMIN',
) {
  await page.context().addCookies([
    { name: 'comercion_access', value: tokens.accessToken, url: API_URL },
    { name: 'comercion_refresh', value: tokens.refreshToken, url: API_URL },
  ]);

  await page.addInitScript(
    ([slug, papel]) => {
      localStorage.setItem('erp.tenantSlug', slug);
      localStorage.setItem('erp.role', papel);
    },
    [loja.slug, papel] as const,
  );
}

/** Pega o par de tokens fazendo login pela API. */
export async function autenticar(request: APIRequestContext, loja: Loja) {
  const resposta = await request.post(`${API_URL}/api/auth/login`, {
    headers: { 'x-tenant-slug': loja.slug },
    data: { email: loja.email, password: loja.senha },
  });
  expect(resposta.ok(), 'login pela API deveria funcionar').toBeTruthy();
  const corpo = await resposta.json();
  return { accessToken: corpo.accessToken, refreshToken: corpo.refreshToken };
}

/**
 * Teste com uma loja pronta e o navegador já autenticado nela.
 */
export const test = base.extend<{ loja: Loja; paginaLogada: Page }>({
  loja: async ({ request }, use) => {
    await use(await criarLoja(request));
  },

  paginaLogada: async ({ page, request, loja }, use) => {
    await entrarComo(page, loja, await autenticar(request, loja));
    await use(page);
  },
});

export { expect };
