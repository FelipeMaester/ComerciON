import { SENHA, criarLoja, expect, test } from '../fixtures';

/**
 * A sessão vive em cookie httpOnly, não em localStorage.
 *
 * Isto precisa de teste de navegador porque nenhum teste unitário enxerga a
 * diferença: o servidor manda o mesmo token nos dois desenhos. O que muda é
 * quem consegue LER — e só o navegador sabe responder isso.
 */
test.describe('sessão', () => {
  test('depois de entrar, nenhum token fica legível pelo JavaScript da página', async ({ page, request }) => {
    const loja = await criarLoja(request);

    await page.goto('/login');
    await page.getByPlaceholder('ex: autopecas-silva').fill(loja.slug);
    await page.locator('input[type=email]').fill(loja.email);
    await page.locator('input[type=password]').fill(SENHA);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText(/visão geral/i)).toBeVisible();

    // 1. Nada de token no armazenamento do navegador.
    const guardado = await page.evaluate(() => ({
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
    }));
    expect(guardado.local).not.toMatch(/eyJ/); // todo JWT começa assim
    expect(guardado.session).not.toMatch(/eyJ/);

    // 2. Nem via document.cookie, que é o que um XSS leria.
    const cookiesVisiveis = await page.evaluate(() => document.cookie);
    expect(cookiesVisiveis).not.toContain('comercion_access');
    expect(cookiesVisiveis).not.toContain('comercion_refresh');

    // 3. E ainda assim o cookie EXISTE e está marcado httpOnly — sem esta
    //    checagem, o teste passaria também se o login simplesmente não
    //    tivesse funcionado.
    const cookies = await page.context().cookies();
    const access = cookies.find((c) => c.name === 'comercion_access');
    expect(access, 'o cookie de sessão deveria ter sido emitido').toBeDefined();
    expect(access?.httpOnly).toBe(true);
  });

  test('a sessão sobrevive a recarregar a página', async ({ paginaLogada: page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/visão geral/i)).toBeVisible();

    await page.reload();
    await expect(page.getByText(/visão geral/i)).toBeVisible();
  });

  test('renova sozinho quando o access token vence, sem derrubar quem está usando', async ({
    page,
    request,
  }) => {
    const loja = await criarLoja(request);

    await page.goto('/login');
    await page.getByPlaceholder('ex: autopecas-silva').fill(loja.slug);
    await page.locator('input[type=email]').fill(loja.email);
    await page.locator('input[type=password]').fill(SENHA);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText(/visão geral/i)).toBeVisible();

    // Simula o access token vencido apagando só ele: é o que o navegador faz
    // sozinho quando o maxAge acaba. O refresh continua lá, e é ele que deve
    // reerguer a sessão na primeira chamada que tomar 401.
    const contexto = page.context();
    const restantes = (await contexto.cookies()).filter((c) => c.name !== 'comercion_access');
    await contexto.clearCookies();
    await contexto.addCookies(restantes);

    await page.goto('/customers');

    // Esperar o "Carregando…" SUMIR, e não só o título aparecer: o título é
    // estático e aparece antes de qualquer chamada à API, então bastava ele
    // para o teste passar sem que a renovação tivesse acontecido. O que prova
    // o ciclo inteiro (401 → refresh → repete a chamada) é a tela sair do
    // estado de carregamento.
    await expect(page.getByRole('heading', { name: /clientes/i })).toBeVisible();
    await expect(page.getByText(/carregando/i)).toBeHidden();

    // E o par novo foi gravado, não só a tela ter carregado por acaso.
    const access = (await contexto.cookies()).find((c) => c.name === 'comercion_access');
    expect(access, 'o refresh deveria ter emitido um access token novo').toBeDefined();
  });
});
