import { api, expect, test } from '../fixtures';

/**
 * O quanto o cliente deve, dito ANTES de a venda começar.
 *
 * O limite de crédito é cobrado na hora de finalizar: a venda fiado que passa
 * do teto é recusada com os números na tela. Correto, e tarde — a peça já está
 * no carrinho e o cliente está na frente, esperando. Descobrir ali transforma
 * uma conversa possível ("dá para adiantar uma parte?") num constrangimento.
 *
 * Estes testes cobrem as três coisas que o balcão precisa: ver a dívida ao
 * escolher o cliente, ser avisado quando o próximo fiado vai ser recusado, e
 * NÃO ver ruído quando não há nada a dizer.
 */
test.describe('situação do cliente no balcão', () => {
  /** Cliente com dívida em aberto, criada por uma venda fiado já vencida. */
  async function clienteDevendo(
    request: Parameters<typeof api>[0],
    loja: Parameters<typeof api>[1],
    opcoes: { limite?: number } = {},
  ) {
    const deposito = (await api(request, loja, 'get', '/warehouses'))[0];
    const cliente = await api(request, loja, 'post', '/customers', {
      type: 'INDIVIDUAL',
      name: 'Cliente devedor',
      phone: '14999990001',
      paymentTermDays: 30,
      ...(opcoes.limite !== undefined ? { creditLimit: opcoes.limite } : {}),
    });
    const produto = await api(request, loja, 'post', '/products', {
      sku: 'SIT-001',
      name: 'Bateria 60Ah',
      price: 500,
      costPrice: 300,
    });
    await api(request, loja, 'post', '/inventory/stock/adjust', {
      productId: produto.id,
      warehouseId: deposito.id,
      type: 'IN',
      quantity: 5,
      reason: 'carga do teste',
    });
    await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      customerId: cliente.id,
      items: [{ productId: produto.id, quantity: 1, unitPrice: 500 }],
      payments: [],
      fiadoDays: 30,
      confirm: true,
    });

    return cliente;
  }

  test('escolher o cliente mostra o que ele já deve', async ({ paginaLogada: page, request, loja }) => {
    const cliente = await clienteDevendo(request, loja);

    await page.goto('/pos');
    await page.getByRole('combobox').first().selectOption(cliente.id);

    await expect(page.getByRole('status')).toContainText('Cliente devedor');
    await expect(page.getByRole('status')).toContainText('R$ 500,00');
  });

  test('avisa quando o próximo fiado seria recusado', async ({ paginaLogada: page, request, loja }) => {
    // Teto igual ao que a venda deixa em aberto: o cliente gastou o limite
    // inteiro. A venda passa (o teto não foi ultrapassado), e a PRÓXIMA fiado
    // seria recusada — que é exatamente o que o balcão precisa saber antes de
    // começar a próxima.
    //
    // A primeira versão deste teste pedia R$ 500 fiado com teto de R$ 100, e
    // reprovava: a conferência de limite recusava a venda, o cliente terminava
    // sem dívida nenhuma e não havia o que avisar. O cenário é que estava
    // errado, não o aviso.
    const cliente = await clienteDevendo(request, loja, { limite: 500 });

    await page.goto('/pos');
    await page.getByRole('combobox').first().selectOption(cliente.id);

    await expect(page.getByRole('status')).toContainText('Limite: R$ 500,00');
    await expect(page.getByRole('status')).toContainText(/seria recusada/i);
  });

  test('cliente avulso não mostra linha nenhuma', async ({ paginaLogada: page, request, loja }) => {
    // Controle. Sem ele, os testes acima passariam mesmo se a linha ficasse
    // permanentemente na tela — e uma linha permanente dizendo "R$ 0,00 em
    // aberto" é ruído no lugar mais concorrido do sistema.
    await clienteDevendo(request, loja);

    await page.goto('/pos');
    await expect(page.getByRole('combobox').first()).toHaveValue('');

    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('cliente sem dívida e sem teto também não vira ruído', async ({ paginaLogada: page, request, loja }) => {
    const limpo = await api(request, loja, 'post', '/customers', {
      type: 'INDIVIDUAL',
      name: 'Cliente em dia',
      phone: '14999990002',
    });

    await page.goto('/pos');
    await page.getByRole('combobox').first().selectOption(limpo.id);

    await expect(page.getByRole('status')).toHaveCount(0);
  });
});
