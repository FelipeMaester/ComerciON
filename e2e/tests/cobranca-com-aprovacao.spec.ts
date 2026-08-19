import { api, expect, test } from '../fixtures';

/**
 * Cobrança que espera autorização.
 *
 * O meio-termo entre as duas pontas que não funcionam: cobrança automática
 * assusta (mensagem errada não volta) e cobrança manual não acontece (ninguém
 * para o balcão para escrever quinze mensagens).
 */
test.describe('cobrança com aprovação', () => {
  /** Deixa uma conta a receber vencendo amanhã, com cliente que tem telefone. */
  async function contaVencendo(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1]) {
    const deposito = (await api(request, loja, 'get', '/warehouses'))[0];
    const cliente = await api(request, loja, 'post', '/customers', {
      type: 'INDIVIDUAL',
      name: 'Dona Ana',
      phone: '5514999998888',
    });
    const produto = await api(request, loja, 'post', '/products', {
      sku: 'COB-001',
      name: 'Amortecedor traseiro',
      price: 400,
      costPrice: 200,
    });
    await api(request, loja, 'post', '/inventory/stock/adjust', {
      productId: produto.id,
      warehouseId: deposito.id,
      type: 'IN',
      quantity: 3,
      reason: 'teste',
    });
    await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      customerId: cliente.id,
      items: [{ productId: produto.id, quantity: 2 }],
      payments: [],
      fiadoDays: 1,
      confirm: true,
    });
    return cliente;
  }

  test('a automação prepara a cobrança com o que foi vendido, sem enviar', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    await contaVencendo(request, loja);

    await api(request, loja, 'post', '/automation-rules', {
      name: 'Cobrança com autorização',
      trigger: 'RECEIVABLE_DUE_IN_DAYS',
      triggerConfig: { days: 3 },
      action: 'PREPARE_WHATSAPP',
      actionConfig: { messageTemplate: 'Olá, {{customerName}}! Sobre {{itens}} — {{valor}} em aberto.' },
      isActive: true,
    });
    // Dispara a varredura na hora, em vez de esperar o cron das 10h.
    await api(request, loja, 'post', '/automation-rules/run-now', {});

    await page.goto('/cobrancas');

    // A mensagem cita a peça e o valor: "você tem uma conta em aberto" faria
    // o cliente responder "qual?".
    await expect(page.getByText('Dona Ana', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveValue(/2x Amortecedor traseiro/);
    await expect(page.getByRole('textbox')).toHaveValue(/R\$\s?800,00/);
  });

  test('descartar tira da fila sem mandar nada', async ({ paginaLogada: page, request, loja }) => {
    await contaVencendo(request, loja);
    await api(request, loja, 'post', '/automation-rules', {
      name: 'Cobrança com autorização',
      trigger: 'RECEIVABLE_DUE_IN_DAYS',
      triggerConfig: { days: 3 },
      action: 'PREPARE_WHATSAPP',
      actionConfig: { messageTemplate: 'Olá, {{customerName}}! Conta em aberto: {{valor}}.' },
      isActive: true,
    });
    await api(request, loja, 'post', '/automation-rules/run-now', {});

    await page.goto('/cobrancas');
    await expect(page.getByText('Dona Ana', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /descartar/i }).click();
    await expect(page.getByText(/descartada/i)).toBeVisible();
    await expect(page.getByText('Nenhuma cobrança esperando')).toBeVisible();
  });

  test('sem regra de cobrança, a fila fica vazia — nada é preparado sozinho', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    await contaVencendo(request, loja);

    await page.goto('/cobrancas');
    await expect(page.getByText('Nenhuma cobrança esperando')).toBeVisible();
  });
});
