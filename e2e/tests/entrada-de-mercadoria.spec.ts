import { api, expect, test } from '../fixtures';

/**
 * A nota do fornecedor chegando no estoque.
 *
 * Antes desta tela, dar entrada era UMA PEÇA POR VEZ pela tela do produto,
 * com tipo/quantidade/motivo. Uma nota com 40 itens eram 40 operações
 * manuais — e não sobrava registro de o que foi comprado, de quem, por
 * quanto, nem quando.
 *
 * É também o lugar onde o custo muda. Comprou mais caro, o custo da peça sobe
 * aqui, e a partir daí toda venda congela o custo novo no item — que é o que
 * faz a margem do painel dizer a verdade.
 */
test.describe('entrada de mercadoria', () => {
  async function duasPecas(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1]) {
    const radiador = await api(request, loja, 'post', '/products', {
      sku: 'RAD-ENT-001',
      name: 'Radiador Gol',
      price: 320,
      costPrice: 180,
    });
    const ventoinha = await api(request, loja, 'post', '/products', {
      sku: 'VENT-ENT-001',
      name: 'Ventoinha Gol',
      price: 280,
      costPrice: 140,
    });
    const deposito = (await api(request, loja, 'get', '/warehouses'))[0];
    return { radiador, ventoinha, deposito };
  }

  test('a nota inteira entra de uma vez: estoque sobe e custo é atualizado', async ({ request, loja }) => {
    const { radiador, ventoinha, deposito } = await duasPecas(request, loja);

    await api(request, loja, 'post', '/purchase-entries', {
      warehouseId: deposito.id,
      invoiceNumber: 'NF-4477',
      items: [
        // O fornecedor aumentou: 180 → 210.
        { productId: radiador.id, quantity: 10, unitCost: 210 },
        { productId: ventoinha.id, quantity: 5, unitCost: 140 },
      ],
      confirm: true,
    });

    const depois = await api(request, loja, 'get', `/products?search=ENT-001`);
    const porSku = new Map(depois.items.map((p: { sku: string }) => [p.sku, p]));

    // O custo do cadastro passa a ser o desta compra — é o número que a próxima
    // venda vai congelar no item.
    expect(Number((porSku.get('RAD-ENT-001') as { costPrice: string }).costPrice)).toBe(210);
    // Controle: a peça que não mudou de preço continua no custo antigo. Sem
    // isto, "atualiza tudo para o mesmo valor" passaria no teste.
    expect(Number((porSku.get('VENT-ENT-001') as { costPrice: string }).costPrice)).toBe(140);

    expect(Number((porSku.get('RAD-ENT-001') as { totalQuantity: number }).totalQuantity)).toBe(10);
    expect(Number((porSku.get('VENT-ENT-001') as { totalQuantity: number }).totalQuantity)).toBe(5);
  });

  test('rascunho não mexe em nada até ser confirmado', async ({ request, loja }) => {
    const { radiador, deposito } = await duasPecas(request, loja);

    const rascunho = await api(request, loja, 'post', '/purchase-entries', {
      warehouseId: deposito.id,
      items: [{ productId: radiador.id, quantity: 10, unitCost: 210 }],
    });
    expect(rascunho.status).toBe('DRAFT');

    // Nota grande se digita aos poucos. Se o estoque subisse a cada linha, o
    // saldo ficaria errado durante toda a digitação — e quem vendesse no meio
    // venderia sobre número que não existe.
    const meio = await api(request, loja, 'get', '/products?search=RAD-ENT-001');
    expect(Number(meio.items[0].costPrice)).toBe(180);
    expect(Number(meio.items[0].totalQuantity ?? 0)).toBe(0);

    await api(request, loja, 'patch', `/purchase-entries/${rascunho.id}/confirm`, {});

    const fim = await api(request, loja, 'get', '/products?search=RAD-ENT-001');
    expect(Number(fim.items[0].costPrice)).toBe(210);
    expect(Number(fim.items[0].totalQuantity)).toBe(10);
  });

  test('a margem da venda usa o custo da compra que a antecedeu', async ({ request, loja }) => {
    // É o encadeamento que dá sentido à funcionalidade inteira: compra atualiza
    // o custo, venda congela o custo, painel mostra a margem verdadeira.
    const { radiador, deposito } = await duasPecas(request, loja);

    await api(request, loja, 'post', '/purchase-entries', {
      warehouseId: deposito.id,
      items: [{ productId: radiador.id, quantity: 10, unitCost: 210 }],
      confirm: true,
    });

    await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      items: [{ productId: radiador.id, quantity: 1, unitPrice: 320 }],
      payments: [{ method: 'CASH', amount: 320 }],
      confirm: true,
    });

    const painel = await api(request, loja, 'get', '/reports/dashboard');

    // Vendeu por 320 uma peça que a última compra custou 210.
    expect(painel.today.total).toBe(320);
    expect(painel.today.margem).toBe(110);
  });

  test('lança a nota pela tela, com duas peças', async ({ paginaLogada: page, request, loja }) => {
    const { radiador } = await duasPecas(request, loja);

    await page.goto('/purchases');
    await page.getByRole('button', { name: 'Lançar nota' }).click();

    await page.getByLabel('Número da nota').fill('NF-777');
    await page.getByLabel('Buscar peça').fill('RAD-ENT-001');
    await page.getByRole('button', { name: new RegExp(radiador.name) }).click();

    await page.getByLabel(/Quantidade de/).fill('4');
    await page.getByLabel(/Custo de/).fill('200');

    // 4 × 200 — o total da nota é somado enquanto se digita.
    await expect(page.getByText('R$ 800,00').first()).toBeVisible();

    await page.getByRole('button', { name: 'Lançar e dar entrada no estoque' }).click();

    await expect(page.getByText('NF-777')).toBeVisible();
    // A linha da nota mostra o selo. .first() porque o <td> que contém só
    // o selo também casa com o texto — não é entrada duplicada, foi medido.
    await expect(page.getByText('No estoque').first()).toBeVisible();
    await expect(page.getByRole('row', { name: /NF-777/ })).toHaveCount(1);
  });
});
