import { api, expect, test } from '../fixtures';

/**
 * Conectar o WhatsApp da própria loja por QR Code.
 *
 * Estes testes NÃO leem o QR — ler conectaria uma conta de verdade. O que eles
 * protegem é o que a tela promete: pedir o código funciona, o risco está dito
 * antes de conectar, e loja sem sessão não finge estar conectada.
 */
test.describe('conexão do WhatsApp', () => {
  test('loja nova aparece como desconectada, com o botão de gerar o código', async ({ paginaLogada: page }) => {
    await page.goto('/whatsapp/conexao');

    await expect(page.getByText('Desconectado')).toBeVisible();
    await expect(page.getByRole('button', { name: /gerar qr code/i })).toBeVisible();
    // Sem número nenhum inventado: loja nova não tem sessão.
    await expect(page.getByText(/nenhum número conectado/i)).toBeVisible();
  });

  test('o risco é dito ANTES de conectar, não depois', async ({ paginaLogada: page }) => {
    await page.goto('/whatsapp/conexao');

    // A escolha é da loja, e para escolher é preciso saber o que está em jogo.
    await expect(page.getByText(/não é oficial/i)).toBeVisible();
    await expect(page.getByText(/pode bloquear o número/i)).toBeVisible();
    await expect(page.getByText(/cobra por conversa/i)).toBeVisible();
  });

  test('a tela é do dono da loja, não do balconista', async ({ paginaLogada: page }) => {
    // Conectar dá acesso à conta de WhatsApp inteira e desconectar derruba o
    // canal de vendas — por isso a rota é @Roles(ADMIN) na API. Aqui só se
    // confirma que a tela existe para quem é ADMIN (o fixture entra como um).
    await page.goto('/whatsapp/conexao');
    await expect(page.getByRole('heading', { name: /conectar whatsapp/i })).toBeVisible();
  });

  /**
   * Depende de WHATSAPP_PROVIDER não ser 'stub'.
   *
   * Com o stub o envio sempre "dá certo": a cobrança sai da fila, a tela não
   * mostra erro nenhum e este teste falha dizendo que não achou a mensagem —
   * o que parece defeito do produto e é configuração do ambiente. Custou uma
   * hora descobrir isso uma vez; fica escrito para não custar de novo.
   */
  test('cobrança não sai se o WhatsApp da loja não estiver conectado', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    // Prepara uma cobrança na fila sem nenhuma sessão conectada.
    const deposito = (await api(request, loja, 'get', '/warehouses'))[0];
    const cliente = await api(request, loja, 'post', '/customers', {
      type: 'INDIVIDUAL',
      name: 'Cliente sem sessão',
      phone: '5514999997777',
    });
    const produto = await api(request, loja, 'post', '/products', {
      sku: 'SEM-001',
      name: 'Peça qualquer',
      price: 100,
      costPrice: 40,
    });
    await api(request, loja, 'post', '/inventory/stock/adjust', {
      productId: produto.id,
      warehouseId: deposito.id,
      type: 'IN',
      quantity: 2,
      reason: 'teste',
    });
    await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      customerId: cliente.id,
      items: [{ productId: produto.id, quantity: 1 }],
      payments: [],
      fiadoDays: 1,
      confirm: true,
    });
    await api(request, loja, 'post', '/automation-rules', {
      name: 'Cobrança',
      trigger: 'RECEIVABLE_DUE_IN_DAYS',
      triggerConfig: { days: 3 },
      action: 'PREPARE_WHATSAPP',
      actionConfig: { messageTemplate: 'Olá, {{customerName}}! {{valor}} em aberto.' },
      isActive: true,
    });
    await api(request, loja, 'post', '/automation-rules/run-now', {});

    await page.goto('/cobrancas');
    await page.getByRole('button', { name: /autorizar e enviar/i }).click();

    // A mensagem diz o que fazer, e a cobrança continua na fila — não some.
    await expect(page.getByText(/não está conectado/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /autorizar e enviar/i })).toBeVisible();
  });
});
