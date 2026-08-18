import { api, autenticar, criarLoja, entrarComo, expect, test } from '../fixtures';

/**
 * As preferências de aparência de quem usa o sistema.
 *
 * Estes testes existem porque a densidade é invisível para type-check e para
 * teste unitário: é uma variável CSS trocada por um atributo no `<html>`, e a
 * única prova de que funciona é medir a altura da linha na tela.
 *
 * Também cobrem a armadilha que quase passou: o script que aplica tema e
 * densidade roda no `<head>`, antes da hidratação, e o React derruba os
 * atributos que ele escreve no elemento raiz ao reconciliar. Medido num
 * navegador: `data-densidade` aparecia no script e sumia da página. Por isso
 * existe também um componente que reaplica depois de montar — e é o efeito
 * final, depois de tudo carregado, que os testes aqui verificam.
 */

/** Abre a tela e espera as preferências já estarem aplicadas no `<html>`. */
async function abrir(page: import('@playwright/test').Page, rota: string) {
  await page.goto(rota);
  await expect(page.locator('html')).toHaveAttribute('data-densidade', /confortavel|compacta/);
}

test.describe('preferências de aparência', () => {
  test('a densidade compacta encolhe a linha da tabela de verdade', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    // Alguns produtos para haver tabela com o que medir.
    for (const sku of ['DENS-1', 'DENS-2', 'DENS-3']) {
      await api(request, loja, 'post', '/products', {
        sku,
        name: `Peça ${sku}`,
        price: 100,
        costPrice: 40,
        minStock: 0,
      });
    }

    await abrir(page, '/products');
    const primeiraLinha = page.locator('table.tabela tbody tr').first();
    await expect(primeiraLinha).toBeVisible();
    const alturaConfortavel = (await primeiraLinha.boundingBox())!.height;

    // Troca a preferência pela tela, não por localStorage: é o caminho que a
    // pessoa percorre, e é ele que precisa funcionar.
    await abrir(page, '/account');
    await page.getByRole('radio', { name: 'Compacta' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-densidade', 'compacta');

    await abrir(page, '/products');
    const alturaCompacta = (await page.locator('table.tabela tbody tr').first().boundingBox())!.height;

    expect(alturaCompacta).toBeLessThan(alturaConfortavel);
    // A escolha sobrevive à recarga — é preferência, não estado de tela.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-densidade', 'compacta');
  });

  test('o tema tem três estados e volta a seguir o computador', async ({ paginaLogada: page }) => {
    await abrir(page, '/account');

    await page.getByRole('radio', { name: 'Escuro' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.getByRole('radio', { name: 'Claro' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    // O terceiro estado é o que a versão anterior não tinha: depois do
    // primeiro clique, não havia mais volta para "seguir o computador".
    await page.getByRole('radio', { name: 'Seguir o computador' }).click();
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Seguir o computador' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('escolher "seguir o computador" acompanha o modo escuro do sistema', async ({
    paginaLogada: page,
  }) => {
    await abrir(page, '/account');
    await page.getByRole('radio', { name: 'Seguir o computador' }).click();

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('reduzir animações marca o documento', async ({ paginaLogada: page }) => {
    await abrir(page, '/account');
    await page.getByRole('checkbox', { name: /Reduzir animações/ }).check();
    await expect(page.locator('html')).toHaveAttribute('data-movimento', 'reduzido');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-movimento', 'reduzido');
  });
});

test.describe('paleta de comandos', () => {
  test('Ctrl+K abre, busca sem acento e Enter navega', async ({ paginaLogada: page }) => {
    await abrir(page, '/dashboard');

    await page.keyboard.press('Control+k');
    const paleta = page.getByRole('dialog', { name: 'Ir para uma tela' });
    await expect(paleta).toBeVisible();

    // Sem cedilha de propósito: é como se digita com pressa no balcão.
    await page.getByLabel('Buscar tela').fill('orcamento');
    await expect(paleta.getByText('Orçamentos')).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/quotes$/);
    await expect(paleta).toBeHidden();
  });

  test('Esc fecha sem sair da tela', async ({ paginaLogada: page }) => {
    await abrir(page, '/dashboard');
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Ir para uma tela' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Ir para uma tela' })).toBeHidden();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('não oferece tela que o plano não libera', async ({ page, request }) => {
    // Trial não tem AUTOMATIONS nem BI (ver PLAN_DEFS no seed), então
    // "Automações" e "Relatórios" não podem aparecer na paleta.
    const trial = await criarLoja(request, 'trial');
    await entrarComo(page, trial, await autenticar(request, trial));

    await abrir(page, '/dashboard');
    await page.keyboard.press('Control+k');
    const paleta = page.getByRole('dialog', { name: 'Ir para uma tela' });
    await expect(paleta).toBeVisible();

    // O PDV existe em qualquer plano — serve de controle: se ele também não
    // aparecesse, o teste passaria por a paleta estar vazia, não por filtrar.
    await expect(paleta.getByText('PDV (venda rápida)')).toBeVisible();
    await expect(paleta.getByText('Automações')).toHaveCount(0);
    await expect(paleta.getByText('Relatórios')).toHaveCount(0);
  });
});
