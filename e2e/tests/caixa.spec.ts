import { api, expect, test } from '../fixtures';

/**
 * O caixa é onde erro vira diferença de dinheiro no fim do dia.
 */
test.describe('caixa', () => {
  test('abrir, vender e fechar: o esperado bate com o que entrou', async ({ paginaLogada: page, request, loja }) => {
    const depositos = await api(request, loja, 'get', '/warehouses');
    const deposito = depositos[0] ?? depositos.items[0];
    const produto = await api(request, loja, 'post', '/products', {
      sku: 'CX-001',
      name: 'Produto do Caixa',
      price: 70,
      costPrice: 30,
    });
    await api(request, loja, 'post', '/inventory/stock/adjust', {
      productId: produto.id,
      warehouseId: deposito.id,
      type: 'IN',
      quantity: 10,
      reason: 'Carga do teste',
    });

    // 1. Abrir com R$ 100 de troco. O formulário já está na tela — não há
    //    modal, então preencher vem antes de clicar.
    await page.goto('/cash');
    await page.locator('input[type=number]').first().fill('100');
    await page.getByRole('button', { name: /abrir caixa/i }).click();
    await expect(page.getByText(/aberto/i).first()).toBeVisible();

    // 2. Vender R$ 70 em dinheiro pelo PDV.
    await page.goto('/pos');
    await page.getByPlaceholder(/código de barras/i).fill('Produto do Caixa');
    await page.getByText('Produto do Caixa').first().click();
    await page.locator('input[type=number]').last().fill('70');
    await page.getByRole('button', { name: /finalizar venda/i }).click();
    // O aviso de sucesso do PDV oferece imprimir o cupom — é por ele que
    // sabemos que a venda foi para o banco, não por um texto genérico.
    await expect(page.getByRole('link', { name: /imprimir cupom/i })).toBeVisible({ timeout: 15_000 });

    // 3. O caixa precisa esperar 100 + 70 = 170.
    //
    //    Foi AQUI que este teste achou um defeito grave: o PDV cria e
    //    confirma a venda numa chamada só (POST /sales com confirm: true) e
    //    esse caminho não vinculava a venda ao caixa aberto — só o caminho
    //    de duas etapas vinculava. Resultado: toda venda de balcão, que é o
    //    jeito normal, ficava invisível na conferência do fim do dia.
    //
    //    A conferência vem da API, não do texto da tela: é o número que a
    //    pessoa compara com o dinheiro na gaveta.
    const caixa = await api(request, loja, 'get', '/cash/current');
    expect(caixa.summary.cashSales, 'a venda em dinheiro tem que entrar no caixa').toBe(70);
    expect(caixa.summary.salesCount, 'a venda tem que ser contada na sessão').toBe(1);
    expect(caixa.summary.expectedAmount, 'troco inicial + vendas em dinheiro').toBe(170);

    await page.goto('/cash');
    await expect(page.getByText('R$ 170,00').first()).toBeVisible();
  });

  test('PDV avisa quando o caixa está fechado, sem impedir a venda', async ({ paginaLogada: page }) => {
    // O aviso importa: quem vende com o caixa fechado não vê a venda na
    // conferência do fim do dia e passa a tarde procurando a diferença.
    await page.goto('/pos');
    await expect(page.getByText(/caixa fechado/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /abrir caixa/i })).toBeVisible();
  });
});
