import { api, expect, test } from '../fixtures';

/**
 * O período que a pessoa escolhe é o período que o relatório usa.
 *
 * A tela somava um dia ao fim de cada intervalo antes de chamar a API. O
 * comentário registrava a razão: "o backend filtra com `to` exclusivo, então
 * avançamos 1 dia para incluir o dia selecionado". Era verdade quando foi
 * escrito.
 *
 * Depois o backend passou a tratar `to` como o dia inteiro (`fimDoDiaDaConsulta`,
 * criado justamente para o fluxo de caixa não perder o último dia do mês). As
 * duas correções, somadas, passaram a incluir um dia a mais do que se pediu.
 *
 * Não é detalhe de exibição: o comparativo compara períodos errados, e a
 * exportação manda ao contador um CSV com uma venda que não é daquele mês.
 */
test.describe('período do relatório', () => {
  /** Uma venda confirmada HOJE — a que não pode aparecer em período anterior. */
  async function vendaDeHoje(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1]) {
    const deposito = (await api(request, loja, 'get', '/warehouses'))[0];
    const produto = await api(request, loja, 'post', '/products', {
      sku: 'REL-001',
      name: 'Radiador Gol',
      price: 320,
      costPrice: 180,
    });
    await api(request, loja, 'post', '/inventory/stock/adjust', {
      productId: produto.id,
      warehouseId: deposito.id,
      type: 'IN',
      quantity: 3,
      reason: 'carga do teste',
    });
    await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      items: [{ productId: produto.id, quantity: 1, unitPrice: 320 }],
      payments: [{ method: 'CASH', amount: 320 }],
      confirm: true,
    });
  }

  /** `2026-09-01`, no fuso local — que é como o input[type=date] pensa. */
  function comoNoCampo(data: Date): string {
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${mes}-${dia}`;
  }

  test('período que termina ontem não enxerga a venda de hoje', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    await vendaDeHoje(request, loja);

    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    const anteontem = new Date(hoje);
    anteontem.setDate(anteontem.getDate() - 2);

    await page.goto('/reports');

    // Período A termina ONTEM: a venda de hoje está fora dele por um dia.
    // Com o dia somado a mais, ela entrava — e o período A, que deveria estar
    // vazio, mostrava a venda.
    const campos = page.locator('input[type="date"]');
    // Os dois primeiros campos da tela são os da exportação; o comparativo
    // vem depois. Errar isso faz o botão continuar desabilitado, que foi como
    // a primeira versão deste teste falhou.
    await campos.nth(2).fill(comoNoCampo(anteontem));
    await campos.nth(3).fill(comoNoCampo(ontem));
    await campos.nth(4).fill(comoNoCampo(hoje));
    await campos.nth(5).fill(comoNoCampo(hoje));

    await page.getByRole('button', { name: 'Comparar' }).click();

    // O período A precisa vir vazio. Com o dia somado a mais, a venda de hoje
    // entrava nele e este "0 vendas" não existia em lugar nenhum da tela.
    await expect(page.getByText('0 vendas').first()).toBeVisible();

    // Controle: o período B tem a venda. Sem isto, o teste passaria se a
    // comparação não tivesse rodado — dois períodos vazios também têm um
    // "0 vendas".
    await expect(page.getByText('R$ 320,00').first()).toBeVisible();
  });

  test('a exportação pede exatamente o intervalo digitado', async ({ paginaLogada: page, request, loja }) => {
    await vendaDeHoje(request, loja);

    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);

    await page.goto('/reports');

    const pedido = page.waitForRequest((r) => /\/reports\/sales\/export/.test(r.url()));

    const campos = page.locator('input[type="date"]');
    await campos.nth(0).fill(comoNoCampo(ontem));
    await campos.nth(1).fill(comoNoCampo(ontem));
    await page.getByRole('button', { name: 'Baixar CSV' }).click();

    const url = new URL((await pedido).url());
    // O que vai na URL é o que a pessoa digitou. O backend é quem sabe que
    // "até 31/08" inclui o dia 31 inteiro — a tela não precisa (nem deve)
    // compensar isso por conta própria.
    expect(url.searchParams.get('to')).toBe(comoNoCampo(ontem));
  });
});
