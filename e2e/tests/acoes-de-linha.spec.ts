import { api, expect, test } from '../fixtures';

/**
 * As ações de cada linha.
 *
 * Antes, a única coisa que dava para fazer com uma peça na lista era abrir a
 * ficha dela. Desativar a que saiu de linha, copiar o SKU para mandar ao
 * fornecedor ou levá-la ao balcão exigia abrir, agir e voltar — ida e volta a
 * cada item numa conferência de estoque.
 */
test.describe('ações por linha', () => {
  async function umaPeca(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1]) {
    return api(request, loja, 'post', '/products', {
      sku: 'ACAO-001',
      name: 'Bomba de combustível',
      price: 380,
      costPrice: 190,
    });
  }

  test('o menu da ÚLTIMA linha aparece inteiro, sem ser cortado pela tabela', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    // Várias peças: o menu da última linha é o que passa do fim da tabela, e é
    // ali que o contêiner com `overflow` corta. Testar na primeira linha não
    // prova nada — o menu cabe dentro da própria tabela e passaria mesmo sem o
    // portal. Medido: a primeira versão deste teste passou com a sabotagem.
    for (let i = 1; i <= 6; i++) {
      await api(request, loja, 'post', '/products', {
        sku: `LIN-00${i}`,
        name: `Peça de linha ${i}`,
        price: 50 * i,
        costPrice: 20 * i,
      });
    }
    await page.goto('/products');

    const ultima = page.locator('tbody tr').last();
    await ultima.getByRole('button', { name: /ações/i }).click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();

    // O que importa não é o menu existir, é dar para clicar no último item:
    // cortado pelo contêiner, ele fica visível pela metade e o clique não
    // chega.
    const ultimoItem = menu.getByRole('menuitem').last();
    const alcancavel = await ultimoItem.evaluate((elemento) => {
      const r = elemento.getBoundingClientRect();
      const emCima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return elemento.contains(emCima) || emCima === elemento;
    });
    expect(alcancavel, 'o último item do menu precisa estar clicável').toBe(true);

    const caixa = (await menu.boundingBox())!;
    const janela = page.viewportSize()!;
    expect(caixa.y + caixa.height).toBeLessThanOrEqual(janela.height);
  });
  test('Esc fecha o menu e devolve o foco ao botão', async ({ paginaLogada: page, request, loja }) => {
    await umaPeca(request, loja);
    await page.goto('/products');

    const botao = page.getByRole('button', { name: /ações de bomba/i });
    await botao.click();
    await expect(page.getByRole('menu')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    // Quem fecha pelo teclado não pode ser largado no começo da página.
    await expect(botao).toBeFocused();
  });

  test('"Vender no PDV" leva a peça junto', async ({ paginaLogada: page, request, loja }) => {
    await umaPeca(request, loja);
    await page.goto('/products');

    await page.getByRole('button', { name: /ações de bomba/i }).click();
    await page.getByRole('menuitem', { name: /vender no pdv/i }).click();

    await expect(page).toHaveURL(/\/pos\?busca=ACAO-001/);
    // O PDV abre com a busca preenchida — sem isso, a ação levaria a uma tela
    // vazia e a pessoa digitaria de novo o que acabou de ler.
    await expect(page.getByPlaceholder(/código de barras/i)).toHaveValue('ACAO-001');
    await expect(page.getByText('Bomba de combustível').first()).toBeVisible();
  });

  test('desativar tira a peça da lista, e dá para trazer de volta', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    await umaPeca(request, loja);
    await page.goto('/products');

    await page.getByRole('button', { name: /ações de bomba/i }).click();
    await page.getByRole('menuitem', { name: /desativar peça/i }).click();

    await expect(page.getByText(/foi desativada/i)).toBeVisible();
    // A lista traz ativas e inativas juntas: o que muda é a etiqueta na linha.
    // Sem ela, desativar parecia não fazer nada.
    await expect(page.getByText('Inativa')).toBeVisible();

    // E dá para trazer de volta pelo mesmo menu.
    await page.getByRole('button', { name: /ações de bomba/i }).click();
    await page.getByRole('menuitem', { name: /reativar peça/i }).click();
    await expect(page.getByText(/voltou para a lista/i)).toBeVisible();
    await expect(page.getByText('Inativa')).toHaveCount(0);
  });

  test('venda confirmada oferece devolução, não cancelamento', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    const deposito = (await api(request, loja, 'get', '/warehouses'))[0];
    const produto = await umaPeca(request, loja);
    await api(request, loja, 'post', '/inventory/stock/adjust', {
      productId: produto.id,
      warehouseId: deposito.id,
      type: 'IN',
      quantity: 3,
      reason: 'teste',
    });
    await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      items: [{ productId: produto.id, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 380 }],
      confirm: true,
    });

    await page.goto('/sales');
    await page.getByRole('button', { name: /ações da venda/i }).first().click();

    // A API só cancela ORÇAMENTO; venda confirmada se devolve. Oferecer
    // "cancelar" aqui prometeria o que o sistema não faz.
    await expect(page.getByRole('menuitem', { name: /registrar devolução/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /cancelar orçamento/i })).toHaveCount(0);

    await page.getByRole('menuitem', { name: /registrar devolução/i }).click();

    // A confirmação diz o que vai acontecer com estoque e dinheiro.
    await expect(page.getByText(/voltam para o estoque/i)).toBeVisible();
    await expect(page.getByText(/financeiro é estornado/i)).toBeVisible();

    await page.getByRole('button', { name: /^registrar a devolução$/i }).click();
    await expect(page.getByText(/devolução registrada/i)).toBeVisible();
    await expect(page.locator('tbody').getByText('Devolvida')).toBeVisible();
  });
});
