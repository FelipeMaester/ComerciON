import { api, expect, test } from '../fixtures';

/**
 * Telas que carregam dados de verdade.
 *
 * Não basta a página responder 200: ela precisa MOSTRAR o dado que existe no
 * banco. A lição veio de um defeito real, numa tela que lia o dado de um
 * endpoint que não o devolvia — o compilador não reclamou porque o campo era
 * opcional, e a lista ficaria permanentemente vazia.
 */
test.describe('telas carregam o que existe no banco', () => {
  test('cupons: o cupom criado pela API aparece na lista', async ({ paginaLogada: page, request, loja }) => {
    await api(request, loja, 'post', '/coupons', {
      code: 'PRIMEIRA10',
      discountType: 'PERCENTAGE',
      value: 10,
      minOrderValue: 50,
    });

    await page.goto('/coupons');

    await expect(page.getByText('PRIMEIRA10')).toBeVisible();
    await expect(page.getByText('10%')).toBeVisible();
    await expect(page.getByText(/50/)).toBeVisible();
  });

  test('produtos: a lista mostra quanto tem em estoque, somando os depósitos', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    await api(request, loja, 'post', '/products', {
      sku: 'FALTA-001',
      name: 'Peça que acabou',
      price: 100,
      costPrice: 40,
      minStock: 5,
    });
    const cheio = await api(request, loja, 'post', '/products', {
      sku: 'CHEIO-001',
      name: 'Peça com sobra',
      price: 100,
      costPrice: 40,
      minStock: 5,
    });
    await api(request, loja, 'post', '/inventory/stock/adjust', {
      productId: cheio.id,
      warehouseId: deposito.id,
      type: 'IN',
      quantity: 42,
      reason: 'carga do teste',
    });

    await page.goto('/products');

    // A coluna lê `totalQuantity`, que a listagem calcula somando os
    // StockItem. Se alguém tirar esse campo do select da API, o tipo continua
    // compilando (é opcional) e a coluna vira "—" em silêncio — foi o mesmo
    // buraco que derrubou a tela de Expedição um dia.
    //
    // A asserção é na CÉLULA, não na linha: "R$ 100,00" contém um zero, então
    // procurar "0" na linha inteira passaria mesmo sem a coluna existir.
    const celulaEstoque = (produto: string) =>
      page.locator('tr', { hasText: produto }).locator('td').nth(4);

    await expect(celulaEstoque('Peça com sobra')).toHaveText('42');
    await expect(celulaEstoque('Peça que acabou')).toHaveText('0');
  });

  test('cupons: dá para criar um pela tela', async ({ paginaLogada: page }) => {
    // Antes desta tela existir, criar cupom exigia mexer no banco.
    await page.goto('/coupons');
    await page.getByRole('button', { name: /novo cupom/i }).click();

    await page.getByPlaceholder('BEMVINDO10').fill('CRIADONATELA');
    await page.locator('input[type=number]').first().fill('25');
    await page.getByRole('button', { name: /criar cupom/i }).click();

    await expect(page.getByText('CRIADONATELA')).toBeVisible();
    await expect(page.getByText('25%')).toBeVisible();
  });

  test('ordens de serviço: a lista mostra a OS e permite avançar o status', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    const cliente = await api(request, loja, 'post', '/customers', {
      type: 'INDIVIDUAL',
      name: 'Cliente da Oficina',
      phone: '11999998888',
    });
    const orcamento = await api(request, loja, 'post', '/quotes', {
      customerId: cliente.id,
      description: 'Troca de radiador',
      items: [{ description: 'Mão de obra', quantity: 1, unitPrice: 250 }],
    });
    await api(request, loja, 'post', `/quotes/${orcamento.id}/approve`, {});

    await page.goto('/service-orders');

    await expect(page.getByText('Cliente da Oficina')).toBeVisible();
    await page.getByRole('button', { name: 'Iniciar' }).first().click();

    // A asserção é na CÉLULA de status da linha, não na página inteira.
    // `getByText('Em execução')` solto casa também com o botão de filtro
    // "Em execução (0)" no topo — e era ele que fazia o teste passar enquanto
    // a linha ainda mostrava "Aberta". Quando a linha finalmente atualizava,
    // viravam dois elementos e o modo estrito do Playwright reclamava: o
    // teste passava ou falhava conforme o instante em que olhasse.
    const linha = page.locator('tr', { hasText: 'Cliente da Oficina' });
    await expect(linha.locator('td').nth(5)).toHaveText('Em execução');
  });


  test('dashboard abre no login e não fica preso em "carregando"', async ({ paginaLogada: page }) => {
    // O dashboard já ficou bloqueado para todo tenant Trial por um
    // @RequiresModule mal posicionado — e é a primeira tela depois do login.
    await page.goto('/dashboard');

    await expect(page.getByText(/visão geral/i)).toBeVisible();
    await expect(page.getByText(/vendas hoje/i)).toBeVisible();
    await expect(page.getByText(/carregando/i)).toBeHidden();
  });
});
