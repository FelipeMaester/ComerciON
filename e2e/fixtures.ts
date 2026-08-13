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
 * addInitScript, e não um clique no login: passar pela tela de login em todo
 * teste tornaria cada um deles um teste de login disfarçado, e mascararia
 * onde a falha realmente aconteceu. O login pela interface tem teste próprio.
 */
export async function entrarComo(page: Page, loja: Loja, tokens: { accessToken: string; refreshToken: string }) {
  await page.addInitScript(
    ([slug, t]) => {
      localStorage.setItem('erp.tenantSlug', slug as string);
      localStorage.setItem('erp.tokens', JSON.stringify(t));
    },
    [loja.slug, tokens] as const,
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
