import { api, expect, test } from '../fixtures';

/**
 * PIX é dinheiro que já entrou, não dinheiro a receber.
 *
 * O sistema tratava como pagas na hora apenas CASH e DEBIT_CARD. O PIX ficou
 * de fora — e isso é um erro sobre o Brasil de hoje, onde para muita loja ele
 * é a forma de pagamento mais usada. Toda venda no PIX virava conta a
 * receber.
 *
 * A consequência não é de relatório: é a loja cobrando quem já pagou. O
 * lançamento nasce com vencimento no dia da venda, então no DIA SEGUINTE o
 * sino diria "N contas vencidas a receber" e o clique levaria a uma lista de
 * vendas quitadas. Medido na loja de exemplo: quatro vendas no PIX, quatro
 * contas pendentes.
 *
 * A suíte já criava vendas no PIX em outros testes — nenhum conferia o que
 * acontecia com o lançamento. Foi assim que o defeito viveu.
 */
test.describe('venda no PIX', () => {
  async function vendaPaga(
    request: Parameters<typeof api>[0],
    loja: Parameters<typeof api>[1],
    metodo: string,
  ) {
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    const produto = await api(request, loja, 'post', '/products', {
      sku: `PIX-${metodo}`,
      name: 'Pastilha de freio',
      price: 200,
      costPrice: 90,
    });
    await api(request, loja, 'post', '/inventory/stock/adjust', {
      productId: produto.id,
      warehouseId: deposito.id,
      type: 'IN',
      quantity: 10,
    });
    const venda = await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      items: [{ productId: produto.id, quantity: 1, unitPrice: 200 }],
    });
    await api(request, loja, 'post', `/sales/${venda.id}/confirm`, {
      payments: [{ method: metodo, amount: 200 }],
    });
    return venda;
  }

  test('nasce quitada, e não como conta a receber', async ({ request, loja }) => {
    await vendaPaga(request, loja, 'PIX');

    const aReceber = await api(request, loja, 'get', '/finance/entries?type=RECEIVABLE&status=PENDING');

    expect(
      aReceber.total,
      'venda no PIX paga integralmente não pode virar conta a receber',
    ).toBe(0);
  });

  /**
   * O outro lado. Sem esta asserção, "consertar" marcando tudo como pago
   * passaria batido — e a loja veria como dinheiro em caixa o que a
   * operadora só repassa em trinta dias.
   */
  test('cartão de crédito continua sendo a receber', async ({ request, loja }) => {
    await vendaPaga(request, loja, 'CREDIT_CARD');

    const aReceber = await api(request, loja, 'get', '/finance/entries?type=RECEIVABLE&status=PENDING');

    expect(aReceber.total).toBe(1);
  });

  /**
   * A consequência que doía: o sino mandando cobrar quem já pagou. O
   * lançamento do PIX nem chega a existir como pendente, então não há o que
   * vencer amanhã.
   */
  test('o sino não passa a cobrar quem pagou no PIX', async ({ request, loja }) => {
    await vendaPaga(request, loja, 'PIX');

    const { avisos } = await api(request, loja, 'get', '/alerts');
    const cobranca = avisos.find((a: { chave: string }) => a.chave === 'contas-a-receber-vencidas');
    const aVencer = avisos.find((a: { chave: string }) => a.chave === 'contas-a-vencer');

    expect(cobranca, 'nada vencido a receber').toBeUndefined();
    expect(aVencer, 'nem nada a vencer — o dinheiro já entrou').toBeUndefined();
  });
});
