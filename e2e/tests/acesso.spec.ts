import { criarLoja, expect, SENHA, test } from '../fixtures';

/**
 * A porta de entrada. Se o login quebra, nada mais importa.
 */
test.describe('acesso', () => {
  test('login pela tela leva ao dashboard', async ({ page, request }) => {
    const loja = await criarLoja(request);

    await page.goto('/login');
    await page.getByPlaceholder('ex: autopecas-silva').fill(loja.slug);
    await page.locator('input[type=email]').fill(loja.email);
    await page.locator('input[type=password]').fill(SENHA);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText(/visão geral/i)).toBeVisible();
  });

  test('senha errada não entra e a mensagem não diz qual campo errou', async ({ page, request }) => {
    // "Credenciais inválidas" sem distinguir e-mail de senha: dizer qual dos
    // dois está errado entrega quais e-mails têm conta na loja.
    const loja = await criarLoja(request);

    await page.goto('/login');
    await page.getByPlaceholder('ex: autopecas-silva').fill(loja.slug);
    await page.locator('input[type=email]').fill(loja.email);
    await page.locator('input[type=password]').fill('senha-errada');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText(/credenciais inválidas/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('sem sessão, uma página interna manda para o login', async ({ page }) => {
    await page.goto('/pos');
    await expect(page).toHaveURL(/\/login/);
  });

  test('sair limpa a sessão e bloqueia a volta', async ({ page, request }) => {
    // Login pela TELA, de propósito. O fixture `paginaLogada` usa
    // addInitScript, que roda a cada carregamento de página e reinjetaria a
    // sessão logo depois do logout — o teste passaria a medir o fixture, não
    // o sistema. Custou uma investigação descobrir isso; fica registrado.
    const loja = await criarLoja(request);
    await page.goto('/login');
    await page.getByPlaceholder('ex: autopecas-silva').fill(loja.slug);
    await page.locator('input[type=email]').fill(loja.email);
    await page.locator('input[type=password]').fill(SENHA);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText(/visão geral/i)).toBeVisible();

    await page.getByRole('button', { name: /sair/i }).click();
    await expect(page).toHaveURL(/\/login/);

    // Voltar pela URL não pode reabrir o painel.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
