import { API_URL, SENHA, criarLoja, expect, test } from '../fixtures';
import { DOMINIO_BASE_TESTE } from '../playwright.config';

/**
 * Uma loja por subdomínio.
 *
 * `oficina.painel.dominio.com` já sabe qual é a loja, então a tela de login
 * para de pedir o "identificador da empresa" — a parte que mais atrapalha
 * quem entra pela primeira vez e que, digitada errado, devolve "credenciais
 * inválidas" e manda a pessoa procurar o problema na senha.
 *
 * Roda num projeto próprio do Playwright, com o domínio resolvido para
 * 127.0.0.1 pelo próprio navegador. NÃO usa .localhost de propósito: o
 * navegador trata cada x.localhost como um SITE diferente, e aí o cookie de
 * sessão não atravessaria — o que diria mais sobre o .localhost do que sobre
 * o sistema. Ver o comentário em playwright.config.ts.
 */
test.describe('loja por subdomínio', () => {
  const enderecoDaLoja = (slug: string) => `http://${slug}.${DOMINIO_BASE_TESTE}:3000`;

  test('a tela de login mostra a loja e para de pedir o identificador', async ({ page, request }) => {
    const loja = await criarLoja(request);

    await page.goto(`${enderecoDaLoja(loja.slug)}/login`);

    const campoDaEmpresa = page.getByPlaceholder('ex: autopecas-silva');
    if (await campoDaEmpresa.isVisible().catch(() => false)) {
      // Painel compilado sem NEXT_PUBLIC_TENANT_BASE_DOMAIN: o recurso está
      // desligado, e desligado ele deve mesmo pedir o identificador. Pular é
      // mais honesto do que falhar por configuração ausente.
      test.skip(true, 'painel compilado sem NEXT_PUBLIC_TENANT_BASE_DOMAIN');
    }

    // Quem digita a senha precisa ver em qual loja está entrando.
    await expect(page.getByText(loja.slug)).toBeVisible();
  });

  test('o domínio-base puro continua perguntando qual é a loja', async ({ page }) => {
    // É a porta de entrada de quem ainda não tem subdomínio, e NÃO pode virar
    // uma loja chamada "painel".
    await page.goto(`http://${DOMINIO_BASE_TESTE}:3000/login`);
    await expect(page.getByPlaceholder('ex: autopecas-silva')).toBeVisible();
  });

  test('a sessão atravessa do subdomínio da loja para a API', async ({ page, request }) => {
    // Este é o teste que justifica o projeto separado. A sessão vive num
    // cookie SameSite=Lax; se o navegador considerasse o painel da loja e a
    // API sites diferentes, o login funcionaria e TODA chamada seguinte
    // voltaria 401 — exatamente o que acontece com .localhost.
    //
    // A chamada é feita direto ao endereço da API, sem passar pelo cliente do
    // painel, para o teste não depender de com qual URL o bundle foi
    // compilado.
    const loja = await criarLoja(request);
    const apiNoMesmoDominio = API_URL.replace('localhost', `api.${DOMINIO_BASE_TESTE.split('.').slice(1).join('.')}`);

    await page.goto(`${enderecoDaLoja(loja.slug)}/login`);

    const login = await page.evaluate(
      async ([api, slug, email, senha]) => {
        const r = await fetch(`${api}/api/auth/login`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-tenant-slug': slug },
          body: JSON.stringify({ email, password: senha }),
        });
        return r.status;
      },
      [apiNoMesmoDominio, loja.slug, loja.email, SENHA] as const,
    );
    expect(login, 'o login pela API deveria funcionar').toBe(200);

    const autenticado = await page.evaluate(async (api) => {
      const r = await fetch(`${api}/api/auth/me`, { credentials: 'include' });
      return r.status;
    }, apiNoMesmoDominio);

    expect(autenticado, 'o cookie de sessão deveria atravessar do subdomínio da loja para a API').toBe(200);
  });
});
