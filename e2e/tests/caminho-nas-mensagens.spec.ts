import { api, expect, test } from '../fixtures';

/**
 * Mensagem que manda a pessoa a um lugar precisa mandar a um lugar que existe.
 *
 * A automação de cobrança falhava dizendo "Leia o QR Code em Configurações →
 * WhatsApp". Configurações trata da identidade da loja e não tem nada de
 * WhatsApp; a conexão mora em Clientes → Conectar WhatsApp. Quem seguia a
 * instrução procurava, não achava, e a automação seguia falhando todo dia às
 * 10h sem ninguém entender por quê.
 *
 * O defeito nasce da distância: a mensagem está na API, o menu está no painel,
 * e nada obrigava os dois a concordarem. Este teste faz essa costura — lê o
 * caminho citado na mensagem e exige que ele exista no menu. Renomear o item
 * sem corrigir a mensagem (ou o contrário) reprova aqui.
 */
test('o caminho citado na falha da automação existe mesmo no menu', async ({
  paginaLogada: page,
  request,
  loja,
}) => {
  const deposito = (await api(request, loja, 'get', '/warehouses'))[0];
  const cliente = await api(request, loja, 'post', '/customers', {
    type: 'INDIVIDUAL',
    name: 'Dona Ana',
    // Com telefone: sem ele a automação falha por outro motivo, e o teste
    // mediria a mensagem errada.
    phone: '14999990003',
  });
  const produto = await api(request, loja, 'post', '/products', {
    sku: 'CAM-001',
    name: 'Amortecedor traseiro',
    price: 400,
    costPrice: 200,
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
    customerId: cliente.id,
    items: [{ productId: produto.id, quantity: 1, unitPrice: 400 }],
    payments: [],
    // Um dia, e não três: a janela do gatilho é [início de hoje, hoje + N),
    // então uma conta que vence daqui a exatos 3 dias E ALGUNS MINUTOS cai
    // fora dela. Foi o que fez a primeira versão deste teste não achar
    // execução nenhuma — e é uma fronteira que merece teste próprio, não um
    // teste de mensagem tropeçando nela.
    fiadoDays: 1,
    confirm: true,
  });

  // Envio DIRETO, e não "preparar": é o caminho que precisa da conexão, e
  // portanto o único que produz esta falha. A loja de teste nunca conectou o
  // WhatsApp, então a falha é certa.
  await api(request, loja, 'post', '/automation-rules', {
    name: 'Cobrança que tenta enviar',
    trigger: 'RECEIVABLE_DUE_IN_DAYS',
    triggerConfig: { days: 3 },
    action: 'SEND_WHATSAPP',
    actionConfig: { messageTemplate: 'Olá, {{customerName}}!' },
    isActive: true,
  });
  await api(request, loja, 'post', '/automation-rules/run-now', {});

  await page.goto('/automations');
  // O rótulo do botão é 'Execuções' — o aviso do topo dizia 'Ver execuções',
  // e essa diferença de duas palavras foi o que fez a primeira versão deste
  // teste falhar. O aviso foi corrigido para citar o botão como ele é.
  await page.getByRole('button', { name: 'Execuções' }).first().click();

  const falha = page.getByText(/não está conectado/i).first();
  await expect(falha).toBeVisible();

  // O caminho citado, extraído da própria mensagem — e não escrito à mão aqui,
  // senão o teste viraria uma cópia do texto em vez de uma conferência dele.
  const texto = (await falha.textContent()) ?? '';
  const caminho = texto.match(/em ([^.]+)\./)?.[1]?.trim() ?? '';
  expect(caminho, 'a mensagem precisa citar um caminho').not.toBe('');

  const [secao, tela] = caminho.split('→').map((parte) => parte.trim());
  expect(tela, 'o caminho precisa ter seção e tela').toBeTruthy();

  // A costura: a seção e a tela citadas existem no menu, com esses nomes.
  //
  // Ambas com `exact`, e nesta ordem. Sem exatidão, "WhatsApp" casaria com
  // "Conectar WhatsApp" e o teste passaria por semelhança em vez de por
  // identidade — foi o que aconteceu ao sabotar: a falha veio de dois links
  // casando com o mesmo pedaço de nome, não de a tela não existir.
  const menu = page.getByRole('navigation');
  // O cabeçalho do grupo é um botão (recolhe e expande). O texto solto casaria
  // também com a TELA "Clientes" — o grupo tem o mesmo nome de um item dentro
  // dele.
  await expect(menu.getByRole('button', { name: secao, exact: true })).toBeVisible();
  await expect(menu.getByRole('link', { name: tela, exact: true })).toBeVisible();
});
