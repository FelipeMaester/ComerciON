import { api, expect, test } from '../fixtures';

/**
 * "Só estoque baixo" é uma tela como as outras: paginada e com busca.
 *
 * A rota devolvia um ARRAY inteiro, sob a premissa escrita no código de que
 * "abaixo do mínimo é uma lista curta por natureza — se for longa, o problema
 * é de compras, não de paginação".
 *
 * A frase é boa e a premissa é falsa: uma loja que acabou de importar o
 * catálogo tem tudo zerado. Medido com 4.000 peças, a tela renderizava as
 * 4.000 linhas — 64 mil nós no DOM e uma página de 228 mil pixels. E a
 * consequência cai justamente sobre quem precisaria comprar: o navegador
 * trava antes de a pessoa conseguir ler a lista.
 *
 * O segundo defeito estava no mesmo ramo: com o filtro ligado, o termo
 * digitado nunca entrava na chamada. Buscar não filtrava nada, em silêncio.
 */
test.describe('estoque baixo', () => {
  /** 30 peças zeradas — mais que uma página — e uma delas com nome próprio. */
  async function catalogoZerado(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1]) {
    for (let i = 1; i <= 30; i++) {
      await api(request, loja, 'post', '/products', {
        sku: `ZERO-${String(i).padStart(3, '0')}`,
        name: i === 7 ? 'Ventoinha rara' : `Radiador ${i}`,
        price: 100,
        costPrice: 50,
        minStock: 5,
      });
    }
  }

  test('mostra uma página, e não o catálogo inteiro', async ({ paginaLogada: page, request, loja }) => {
    await catalogoZerado(request, loja);

    await page.goto('/products?estoque=baixo');
    await expect(page.getByText(/30 produtos/)).toBeVisible();

    // 25 por página, como qualquer outra listagem do sistema.
    await expect(page.locator('main tbody tr')).toHaveCount(25);
    await expect(page.getByText(/página 1 de 2/)).toBeVisible();

    // Controle: a segunda página existe e traz o resto. Sem isto, "25 linhas"
    // passaria mesmo se as outras 5 tivessem sumido.
    await page.getByRole('button', { name: 'Próxima' }).click();
    await expect(page.getByText(/página 2 de 2/)).toBeVisible();
    await expect(page.locator('main tbody tr')).toHaveCount(5);
  });

  test('a busca funciona com o filtro ligado', async ({ paginaLogada: page, request, loja }) => {
    await catalogoZerado(request, loja);

    await page.goto('/products?estoque=baixo');
    await expect(page.getByText(/30 produtos/)).toBeVisible();

    await page.getByPlaceholder(/Buscar por nome/).fill('ventoinha');
    await page.getByRole('button', { name: 'Buscar' }).click();

    // Antes o termo era ignorado e a lista continuava com as 30. A linha de
    // paginação some com uma página só (totalPages <= 1), então quem conta
    // aqui são as linhas da tabela.
    await expect(page.getByText('Ventoinha rara')).toBeVisible();
    await expect(page.locator('main tbody tr')).toHaveCount(1);

    // Controle: o filtro continua ligado — buscar não pode desmarcá-lo, senão
    // o resultado passaria a incluir peça com estoque cheio.
    await expect(page.getByRole('checkbox')).toBeChecked();
  });
});
