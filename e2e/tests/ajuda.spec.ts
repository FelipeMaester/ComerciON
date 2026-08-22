import { autenticar, criarLoja, entrarComo, expect, test } from '../fixtures';

/**
 * A ajuda dentro do sistema.
 *
 * Ajuda que mente é pior que ajuda nenhuma: a pessoa lê, confia, faz errado e
 * para de procurar. Estes testes cobrem as três formas de mentir que dependem
 * de código, e não de revisão de texto — sumir do menu, não achar o que a
 * pessoa digita, e ensinar função que o plano dela não libera.
 */
test.describe('ajuda', () => {
  test('está no menu e abre com as telas explicadas', async ({ paginaLogada: page }) => {
    await page.goto('/dashboard');
    await page.getByRole('navigation').getByRole('link', { name: 'Ajuda' }).click();

    await expect(page).toHaveURL(/\/ajuda$/);
    await expect(page.getByRole('heading', { name: 'Ajuda', level: 1 })).toBeVisible();
    // Um número baixo de propósito: o teste não é sobre quantas telas existem,
    // é sobre a página não ter vindo vazia.
    expect(await page.locator('main article').count()).toBeGreaterThan(10);
  });

  test('a busca acha pela palavra do balcão, não pelo nome da tela', async ({ paginaLogada: page }) => {
    await page.goto('/ajuda');

    // "fiado" não é nome de tela nenhuma. Se a busca só olhasse títulos, não
    // acharia nada — e é exatamente assim que a pessoa procura: pelo que está
    // tentando fazer, não pelo nome que o sistema deu à tela.
    await page.getByLabel('Buscar na ajuda').fill('fiado');

    const titulos = page.locator('main article .titulo-secao');
    await expect(titulos.filter({ hasText: 'PDV (venda rápida)' })).toHaveCount(1);
    await expect(titulos.filter({ hasText: 'Clientes' })).toHaveCount(1);
    // Controle: se tudo continuasse aparecendo, o teste acima passaria sem a
    // busca filtrar coisa alguma.
    await expect(titulos.filter({ hasText: 'Cupons' })).toHaveCount(0);
  });

  test('a resposta aparece já aberta quando veio de uma busca', async ({ paginaLogada: page }) => {
    // Achar a tela e ainda ter que clicar para ver a resposta que casou com o
    // termo é fazer a pessoa procurar duas vezes.
    await page.goto('/ajuda');
    await page.getByLabel('Buscar na ajuda').fill('limite de crédito');

    await expect(page.getByText(/teto do saldo em aberto/i).first()).toBeVisible();
  });

  test('não ensina função que o plano da loja não libera', async ({ page, request }) => {
    // Trial não tem AUTOMATIONS nem BI (ver PLAN_DEFS no seed). Ensinar essas
    // telas mandaria a pessoa procurar no menu algo que não existe para ela.
    const trial = await criarLoja(request, 'trial');
    await entrarComo(page, trial, await autenticar(request, trial));

    await page.goto('/ajuda');

    const titulos = page.locator('main article .titulo-secao');
    // O PDV existe em qualquer plano — sem este controle, o teste passaria
    // por a página estar vazia em vez de por ela filtrar.
    await expect(titulos.filter({ hasText: 'PDV (venda rápida)' })).toHaveCount(1);
    await expect(titulos.filter({ hasText: 'Automações' })).toHaveCount(0);
    await expect(titulos.filter({ hasText: 'Relatórios' })).toHaveCount(0);
  });
});
