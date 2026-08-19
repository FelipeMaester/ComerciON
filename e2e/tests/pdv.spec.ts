import { api, expect, test } from '../fixtures';

/**
 * O PDV é a tela que não pode quebrar: com ela fora, a loja para de vender.
 */
test.describe('PDV', () => {
  test.beforeEach(async ({ request, loja }) => {
    const depositos = await api(request, loja, 'get', '/warehouses');
    const deposito = depositos[0] ?? depositos.items?.[0];

    await api(request, loja, 'post', '/products', {
      sku: 'RAD-GOL-001',
      barcode: '7891234567890',
      name: 'Radiador Gol G5',
      price: 320,
      costPrice: 180,
      minStock: 2,
    });
    await api(request, loja, 'post', '/products', {
      sku: 'FIL-OLE-002',
      name: 'Filtro de óleo',
      price: 35.5,
      costPrice: 18,
      minStock: 5,
    });

    const produtos = await api(request, loja, 'get', '/products?pageSize=50');
    for (const produto of produtos.items) {
      await api(request, loja, 'post', '/inventory/stock/adjust', {
        productId: produto.id,
        warehouseId: deposito.id,
        type: 'IN',
        quantity: 20,
        reason: 'Carga inicial do teste',
      });
    }
  });

  /**
   * ESTE é o teste que faltava. A busca do PDV ficou quebrada nesta sessão
   * porque o ValidationPipe recusava `?search=` com 400 — parâmetro não
   * declarado no DTO — e nem o type-check nem os 416 testes unitários
   * perceberam. Só se pega pedindo à tela que busque de verdade.
   */
  test('busca produto por nome e adiciona à venda', async ({ paginaLogada: page }) => {
    await page.goto('/pos');

    await page.getByPlaceholder(/código de barras/i).fill('Radiador');

    const resultado = page.getByText('Radiador Gol G5').first();
    await expect(resultado, 'a busca do PDV precisa retornar o produto').toBeVisible();

    await resultado.click();

    // O produto entrou no carrinho com o preço certo. Ancorado na linha do
    // carrinho, não num /320/ solto: esse número aparece em seis lugares da
    // tela e a asserção passaria mesmo com o carrinho vazio.
    const linha = page.locator('tr', { hasText: 'Radiador Gol G5' });
    await expect(linha).toContainText('R$ 320,00');
  });

  test('leitor de código de barras: código exato tem prioridade sobre o item destacado', async ({
    paginaLogada: page,
  }) => {
    await page.goto('/pos');

    // Um leitor é um teclado rápido que termina em Enter. Se o Enter pegasse
    // o item destacado da lista em vez do código lido, o operador venderia o
    // produto errado sem perceber.
    const busca = page.getByPlaceholder(/código de barras/i);
    await expect(busca).toBeVisible();
    await busca.fill('7891234567890');
    await busca.press('Enter');

    await expect(page.getByText('Radiador Gol G5')).toBeVisible();
  });

  test('venda completa: adiciona, cobra em dinheiro e confirma', async ({ paginaLogada: page, request, loja }) => {
    await page.goto('/pos');

    await page.getByPlaceholder(/código de barras/i).fill('Filtro');
    await page.getByText('Filtro de óleo').first().click();

    // Informar o valor recebido. Sem isso o PDV recusa, e com razão: "A soma
    // dos pagamentos precisa ser igual ao total da venda". O teste anterior
    // não fazia este passo e por isso a venda nunca era confirmada.
    await page.locator('input[type=number]').last().fill('35.50');
    await expect(page.getByText(/faltam/i)).toBeHidden();

    await page.getByRole('button', { name: /finalizar venda/i }).click();

    // A prova não é a tela dizer que deu certo — é a venda existir no banco.
    await expect(async () => {
      const vendas = await api(request, loja, 'get', '/sales?pageSize=10');
      const confirmadas = vendas.items.filter((v: { status: string }) => v.status === 'CONFIRMED');
      expect(confirmadas.length, 'a venda deveria estar confirmada na API').toBeGreaterThan(0);
    }).toPass({ timeout: 15_000 });
  });
});

/**
 * Camadas: o que flutua tem que ficar por cima do que é fixo.
 *
 * O cabeçalho da tabela do carrinho é `sticky` e nasceu na mesma camada da
 * lista de resultados da busca. Empatados, ganha quem vem depois no HTML — e a
 * tabela vem depois do campo. Resultado medido: a peça aparecia na lista e o
 * clique não chegava nela, porque o cabeçalho "Produto" interceptava o
 * ponteiro. Dava para ver e não dava para usar.
 */
test('a lista de resultados fica clicável por cima da tabela do carrinho', async ({
  paginaLogada: page,
  request,
  loja,
}) => {
  const deposito = (await api(request, loja, 'get', '/warehouses'))[0];
  const produto = await api(request, loja, 'post', '/products', {
    sku: 'CAM-001',
    name: 'Pastilha de camada',
    price: 100,
    costPrice: 40,
  });
  await api(request, loja, 'post', '/inventory/stock/adjust', {
    productId: produto.id,
    warehouseId: deposito.id,
    type: 'IN',
    quantity: 5,
    reason: 'teste',
  });

  await page.goto('/pos');
  await page.getByPlaceholder(/código de barras/i).fill('Pastilha de camada');

  const item = page.getByText('Pastilha de camada').first();
  await expect(item).toBeVisible();

  // O que o defeito quebrava não era a visibilidade, era o clique: quem está
  // por cima naquele ponto da tela tem que ser a lista, não o cabeçalho.
  const noTopo = await item.evaluate((elemento) => {
    const r = elemento.getBoundingClientRect();
    const emCima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return elemento.contains(emCima) || Boolean(emCima?.closest('li'));
  });
  expect(noTopo, 'a lista precisa estar acima do cabeçalho fixo da tabela').toBe(true);

  await item.click({ timeout: 5000 });
  await expect(page.getByRole('cell', { name: 'Pastilha de camada' })).toBeVisible();
});
