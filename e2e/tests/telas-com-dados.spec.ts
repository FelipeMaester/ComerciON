import { api, expect, test } from '../fixtures';

/**
 * Telas que carregam dados de verdade.
 *
 * Existe por causa de um defeito concreto: a tela de Expedição lia o envio de
 * `GET /sales`, que NÃO devolve esse campo. Como `Sale.shipment` é opcional no
 * tipo, o TypeScript não reclamou e a lista ficaria permanentemente vazia — o
 * banco com 6 envios e a tela dizendo "nenhum envio".
 *
 * A lição que estes testes aplicam: não basta a página responder 200. Ela
 * precisa MOSTRAR o dado que existe no banco.
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
    await expect(page.getByText('Em execução')).toBeVisible();
  });

  test('expedição: envio criado pela API aparece na tela', async ({ paginaLogada: page, request, loja }) => {
    // A reprodução exata do defeito. Antes da correção esta tela mostraria
    // "Nenhum envio em andamento" com o envio existindo no banco.
    const depositos = await api(request, loja, 'get', '/warehouses');
    const deposito = depositos[0] ?? depositos.items[0];
    const produto = await api(request, loja, 'post', '/products', {
      sku: 'ENV-001',
      name: 'Produto para enviar',
      price: 100,
      costPrice: 50,
    });
    await api(request, loja, 'post', '/inventory/stock/adjust', {
      productId: produto.id,
      warehouseId: deposito.id,
      type: 'IN',
      quantity: 5,
      reason: 'Carga do teste',
    });

    const venda = await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      items: [{ productId: produto.id, quantity: 1, unitPrice: 100 }],
      payments: [{ method: 'PIX', amount: 100 }],
    });
    await api(request, loja, 'post', `/sales/${venda.id}/confirm`, {});
    await api(request, loja, 'post', `/logistics/shipments/sales/${venda.id}`, {
      carrier: 'Transportadora Teste',
      trackingCode: 'BR123456789XY',
    });

    await page.goto('/shipments');

    await expect(page.getByText('Transportadora Teste')).toBeVisible();
    await expect(page.getByText('BR123456789XY')).toBeVisible();
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
