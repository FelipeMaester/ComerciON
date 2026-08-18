import { api, expect, test } from '../fixtures';

/**
 * O sino existe para o sistema deixar de ser passivo: os números já estavam no
 * banco, mas só apareciam para quem abrisse a tela certa e reparasse.
 *
 * O que estes testes protegem é a promessa do sino — que cada aviso leva à
 * tela que resolve, JÁ FILTRADA. Aviso que conta 3 peças em falta e larga a
 * pessoa na lista inteira de produtos não economiza trabalho nenhum.
 */
test.describe('avisos da loja', () => {
  test('loja nova mostra "tudo em dia"', async ({ paginaLogada: page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /avisos/i }).click();
    await expect(page.getByText('Tudo em dia')).toBeVisible();
  });

  test('peça abaixo do mínimo aparece no sino e leva à lista dessas peças', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    const produto = await api(request, loja, 'post', '/products', {
      sku: 'AV-001',
      name: 'Correia dentada',
      price: 90,
      costPrice: 40,
      minStock: 5,
    });
    // Sem entrada de estoque: a peça nasce com zero, abaixo do mínimo de 5.
    expect(produto.minStock).toBe(5);

    await page.goto('/dashboard');
    await page.getByRole('button', { name: /avisos/i }).click();

    const aviso = page.getByRole('link', { name: /abaixo do mínimo/i });
    await expect(aviso).toBeVisible();
    await aviso.click();

    // Caiu na lista já filtrada, e não na lista inteira de produtos.
    await expect(page).toHaveURL(/estoque=baixo/);
    await expect(page.getByText('Correia dentada')).toBeVisible();
    await expect(page.getByLabel(/só estoque baixo/i)).toBeChecked();
  });

  test('conta vencida aparece como urgente e leva ao financeiro filtrado', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await api(request, loja, 'post', '/finance/entries', {
      type: 'PAYABLE',
      description: 'Fornecedor de óleo',
      amount: 850,
      dueDate: ontem,
    });

    await page.goto('/dashboard');
    await page.getByRole('button', { name: /avisos/i }).click();

    const aviso = page.getByRole('link', { name: /conta vencida a pagar/i });
    await expect(aviso).toBeVisible();
    await aviso.click();

    await expect(page).toHaveURL(/situacao=vencidas/);
    await expect(page.getByText('Fornecedor de óleo')).toBeVisible();
    // O recorte precisa estar visível e ter saída.
    await expect(page.getByText('Só vencidas')).toBeVisible();
  });

  test('o número no sino conta o que precisa de atenção', async ({ paginaLogada: page, request, loja }) => {
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await api(request, loja, 'post', '/finance/entries', {
      type: 'RECEIVABLE',
      description: 'Cliente em atraso',
      amount: 300,
      dueDate: ontem,
    });
    await api(request, loja, 'post', '/products', {
      sku: 'AV-002',
      name: 'Pastilha traseira',
      price: 120,
      costPrice: 60,
      minStock: 3,
    });

    await page.goto('/dashboard');
    // Dois avisos distintos: conta vencida e peça em falta.
    await expect(page.getByRole('button', { name: /avisos: 2 itens/i })).toBeVisible();
  });
});

/**
 * O sino conta e a tela lista: os dois têm que dizer o mesmo número.
 *
 * Esta era a divergência real, achada na loja demo com dados de verdade: o
 * sino contava 2 peças em falta e a lista mostrava 1. Cinco lugares do sistema
 * tratavam "no limite" como falta (`<=`) e um só, justamente o endpoint por
 * trás do filtro, exigia estar abaixo (`<`).
 */
test('a peça exatamente no mínimo aparece no sino E na lista para onde ele leva', async ({
  paginaLogada: page,
  request,
  loja,
}) => {
  const produto = await api(request, loja, 'post', '/products', {
    sku: 'LIM-001',
    name: 'Filtro no limite',
    price: 60,
    costPrice: 25,
    minStock: 2,
  });
  const depositos = await api(request, loja, 'get', '/warehouses');
  const deposito = depositos[0] ?? depositos.items[0];
  // Estoque EXATAMENTE no mínimo: o ponto de reposição já foi atingido.
  await api(request, loja, 'post', '/inventory/stock/adjust', {
    productId: produto.id,
    warehouseId: deposito.id,
    type: 'IN',
    quantity: 2,
    reason: 'Carga do teste',
  });

  await page.goto('/dashboard');
  await page.getByRole('button', { name: /avisos/i }).click();
  const aviso = page.getByRole('link', { name: '1 peça abaixo do mínimo' });
  await expect(aviso).toBeVisible();
  await aviso.click();

  await expect(page).toHaveURL(/estoque=baixo/);
  await expect(page.getByText('Filtro no limite')).toBeVisible();
  // O número do sino tem que bater com o tamanho da lista de destino.
  await expect(page.locator('tbody tr')).toHaveCount(1);
});
