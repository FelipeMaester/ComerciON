import { expect, test } from '../fixtures';

/**
 * As telas de beco sem saída.
 *
 * Antes destes arquivos, endereço errado caía na tela do Next em inglês
 * ("This page could not be found") e um erro de render virava
 * "Application error: a client-side exception has occurred" — sem link, sem
 * botão, sem nada. Quem está no balcão com um cliente esperando lê isso e
 * conclui que o sistema morreu.
 */
test.describe('endereço que não existe', () => {
  test('mostra 404 em português, com caminho de volta', async ({ paginaLogada: page }) => {
    const resposta = await page.goto('/rota-que-nunca-existiu');

    // O código HTTP continua sendo 404: quem monitora o site de fora precisa
    // enxergar isso, e um 200 numa página de erro estraga qualquer métrica.
    expect(resposta?.status()).toBe(404);

    await expect(page.getByRole('heading', { name: /esta página não existe/i })).toBeVisible();
    await expect(page.getByText(/This page could not be found/i)).toHaveCount(0);

    // Sem saída não é aviso, é beco.
    await page.getByRole('link', { name: /ir para o painel/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('vale também para um detalhe que não existe', async ({ paginaLogada: page }) => {
    await page.goto('/produtos-inexistentes/123');
    await expect(page.getByRole('heading', { name: /esta página não existe/i })).toBeVisible();
  });
});

test.describe('tela que quebra', () => {
  test('o painel continua em volta, com botão para tentar de novo', async ({ paginaLogada: page }) => {
    // A API devolve algo que a tela não espera. É o que acontece de verdade
    // quando um deploy da API muda um contrato sem o painel saber.
    await page.route('**/api/reports/dashboard*', (rota) =>
      rota.fulfill({ status: 200, contentType: 'application/json', body: '{"series":null}' }),
    );

    // Chega na tela quebrada NAVEGANDO, que é como a pessoa chega: já estava
    // no painel e clicou no menu.
    //
    // Não vale carregar o /dashboard direto aqui: quando a falha acontece
    // durante a hidratação, o erro escapa do limite desta tela e sobe para o
    // global — medido, cerca de uma vez a cada seis carregamentos diretos.
    // O comportamento é aceitável (a tela global também é em português e tem
    // saída), mas transformaria este teste num sorteio.
    await page.goto('/products');
    await expect(page.getByRole('heading', { name: 'Produtos' })).toBeVisible();
    await page.locator('aside').getByRole('link', { name: 'Painel' }).click();

    await expect(page.getByText(/esta tela não carregou/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /tentar de novo/i })).toBeVisible();

    // O menu tem que continuar ali: o que quebrou foi uma tela, não o sistema.
    await expect(page.locator('aside').getByRole('link', { name: /produtos e estoque/i })).toBeVisible();

    // E a saída lateral funciona.
    await page.locator('aside').getByRole('link', { name: /produtos e estoque/i }).click();
    await expect(page).toHaveURL(/\/products/);
    await expect(page.getByRole('heading', { name: 'Produtos' })).toBeVisible();
  });

  test('tentar de novo refaz a tela sem recarregar a página', async ({ paginaLogada: page }) => {
    let falhar = true;
    await page.route('**/api/reports/dashboard*', (rota) => {
      if (falhar) return rota.fulfill({ status: 200, contentType: 'application/json', body: '{"series":null}' });
      return rota.continue();
    });

    await page.goto('/products');
    await expect(page.getByRole('heading', { name: 'Produtos' })).toBeVisible();
    await page.locator('aside').getByRole('link', { name: 'Painel' }).click();
    await expect(page.getByText(/esta tela não carregou/i)).toBeVisible();

    // Marca a página para provar que ela NÃO recarregou: se `reset()` fizesse
    // um F5, esta marca sumiria.
    await page.evaluate(() => ((window as unknown as { marca?: string }).marca = 'viva'));

    falhar = false;
    await page.getByRole('button', { name: /tentar de novo/i }).click();

    await expect(page.getByRole('heading', { name: /visão geral/i })).toBeVisible();
    const marca = await page.evaluate(() => (window as unknown as { marca?: string }).marca);
    expect(marca, 'a página não pode ter recarregado').toBe('viva');
  });
});
