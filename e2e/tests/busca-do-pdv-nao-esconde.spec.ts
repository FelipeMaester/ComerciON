import { api, expect, test } from '../fixtures';

/**
 * A busca do PDV diz quando está escondendo peça.
 *
 * A lista de sugestões pede 8 ao servidor e mostra 8. Numa loja de teste com
 * seis peças isso nunca aparece; num catálogo de verdade, "radiador" tem
 * centenas — e a tela mostrava os oito primeiros sem dizer que existiam mais.
 *
 * O efeito no balcão é o pior possível: o vendedor digita o que o cliente
 * pediu, não vê a peça entre as oito, e responde "não temos" com a peça no
 * estoque. A venda vai embora e ninguém fica sabendo por quê.
 *
 * A resposta do servidor sempre trouxe o total — era só não jogar fora.
 */
test.describe('busca do PDV', () => {
  /** Doze peças que casam com o mesmo termo: mais do que a lista mostra. */
  async function catalogoGrande(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1]) {
    const deposito = (await api(request, loja, 'get', '/warehouses'))[0];
    for (let i = 1; i <= 12; i++) {
      const produto = await api(request, loja, 'post', '/products', {
        sku: `RAD-${String(i).padStart(3, '0')}`,
        name: `Radiador modelo ${i}`,
        price: 100 + i,
        costPrice: 50,
      });
      await api(request, loja, 'post', '/inventory/stock/adjust', {
        productId: produto.id,
        warehouseId: deposito.id,
        type: 'IN',
        quantity: 2,
        reason: 'carga do teste',
      });
    }
    // Uma peça única, para o caso em que nada é escondido.
    await api(request, loja, 'post', '/products', {
      sku: 'VENT-UNICA',
      name: 'Ventoinha única',
      price: 300,
      costPrice: 100,
    });
  }

  test('avisa quantas peças ficaram de fora', async ({ paginaLogada: page, request, loja }) => {
    await catalogoGrande(request, loja);

    await page.goto('/pos');
    await page.getByPlaceholder(/Bipe o código de barras/).fill('radiador');

    // 12 casam, 8 aparecem. Sem esta linha, as outras 4 são invisíveis.
    await expect(page.getByText(/Mostrando 8 de 12/)).toBeVisible();
  });

  test('não avisa quando não há nada escondido', async ({ paginaLogada: page, request, loja }) => {
    // Controle: um recado que aparece sempre é ruído, e ruído no balcão é o
    // que faz a pessoa parar de ler os recados que importam.
    await catalogoGrande(request, loja);

    await page.goto('/pos');
    await page.getByPlaceholder(/Bipe o código de barras/).fill('ventoinha');

    await expect(page.getByRole('button', { name: /Ventoinha única/ })).toBeVisible();
    await expect(page.getByText(/Mostrando/)).toHaveCount(0);
  });
});
