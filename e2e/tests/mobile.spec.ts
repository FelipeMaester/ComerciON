import { test, expect } from '../fixtures';

/**
 * A gaveta do menu no celular.
 *
 * O `playwright.config.ts` já declarava um projeto `mobile` apontando para
 * este arquivo — que não existia. Ou seja: a gaveta era o único componente do
 * painel sem nenhuma cobertura, e foi justamente o que mais mudou na
 * repaginação do visual (cabeçalho da loja, ícones, rodapé com o usuário).
 *
 * Roda no perfil Pixel 5, abaixo dos 768px onde a sidebar fixa não cabe.
 */
test.describe('menu no celular', () => {
  test('a gaveta abre pelo botão, navega e fecha sozinha', async ({ paginaLogada: page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();

    const pdv = page.getByRole('link', { name: 'PDV (venda rápida)' });
    const abrir = page.getByRole('button', { name: 'Abrir menu' });

    // Fechada, o menu está fora da tela — visível para o leitor de tela, mas
    // não alcançável pelo dedo.
    await expect(abrir).toBeVisible();
    await expect(pdv).not.toBeInViewport();

    await abrir.click();
    await expect(pdv).toBeInViewport();

    // Navegar fecha a gaveta: sem isso, ela ficaria por cima da tela que a
    // pessoa acabou de abrir.
    await pdv.click();
    await expect(page.getByRole('heading', { name: /PDV/ })).toBeVisible();
    await expect(pdv).not.toBeInViewport();
  });

  test('o botão de fechar e o toque fora fecham a gaveta', async ({ paginaLogada: page }) => {
    await page.goto('/dashboard');
    const pdv = page.getByRole('link', { name: 'PDV (venda rápida)' });

    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(pdv).toBeInViewport();
    await page.getByRole('button', { name: 'Fechar menu' }).click();
    await expect(pdv).not.toBeInViewport();

    // Tocar fora é o gesto que todo mundo tenta primeiro.
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(pdv).toBeInViewport();
    await page.mouse.click(350, 400);
    await expect(pdv).not.toBeInViewport();
  });

  test('a tela cabe na largura do celular', async ({ paginaLogada: page }) => {
    for (const tela of ['/dashboard', '/pos', '/sales', '/finance', '/products']) {
      await page.goto(tela);
      await expect(page.locator('h1').first()).toBeVisible();
      const medida = await page.evaluate(() => ({
        largura: document.documentElement.scrollWidth,
        janela: window.innerWidth,
      }));
      expect(medida.largura, `${tela} rola de lado no celular`).toBeLessThanOrEqual(medida.janela + 1);
    }
  });
});
