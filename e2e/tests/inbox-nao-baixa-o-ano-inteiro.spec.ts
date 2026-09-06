import { API_URL, api, expect, test } from '../fixtures';

/**
 * O Inbox do WhatsApp carregava tudo o que a loja já conversou.
 *
 * Medido numa loja com 2.000 conversas e 24.385 mensagens — um ano de uso
 * comum numa auto peças:
 *
 *   abrir o Inbox ............ 1.492.064 bytes
 *   abrir uma conversa antiga .. 157.553 bytes
 *
 * A lista trazia TODAS as conversas, cada uma com a ficha inteira do cliente
 * (endereço, documento, limite de crédito, observações) para escrever o nome
 * numa linha. E a conversa trazia todas as mensagens dela, sem teto.
 *
 * O pior estava na escrita: `reply` terminava em `findOne`, então o histórico
 * inteiro voltava a CADA resposta que o atendente digitava — a conversa mais
 * antiga, que é a do melhor cliente, era a mais cara de atender.
 *
 * Nota sobre este teste: as mensagens usadas de propósito não casam com
 * nenhuma regra do chatbot. Se casassem, ele responderia — e responder é
 * mandar mensagem de verdade pelo WhatsApp da loja.
 */
test.describe('inbox do WhatsApp', () => {
  const NUMEROS = [
    '+5511900000001',
    '+5511900000002',
    '+5511900000003',
    '+5511900000004',
    '+5511900000005',
    '+5511900000006',
  ];

  async function inboxComHistorico(
    request: Parameters<typeof api>[0],
    loja: Parameters<typeof api>[1],
    tamanhoDaConversaLonga = 5,
  ) {
    for (const from of NUMEROS) {
      await api(request, loja, 'post', '/whatsapp/webhook', {
        from,
        text: 'Bom dia, tem pastilha dianteira para Gol 2015?',
      });
    }
    // O primeiro número vira o cliente de longa data.
    for (let i = 2; i <= tamanhoDaConversaLonga; i++) {
      await api(request, loja, 'post', '/whatsapp/webhook', {
        from: NUMEROS[0],
        text: `Mensagem número ${i} desta conversa`,
      });
    }
  }

  test('a lista pagina, filtra e busca', async ({ request, loja }) => {
    await inboxComHistorico(request, loja);

    const pagina = await api(request, loja, 'get', '/whatsapp/conversations?pageSize=2');
    expect(pagina.total).toBe(NUMEROS.length);
    expect(pagina.items).toHaveLength(2);
    expect(pagina.totalPages).toBe(3);

    // Controle: a última página traz o resto, sem repetir conversa.
    const ultima = await api(request, loja, 'get', '/whatsapp/conversations?pageSize=2&page=3');
    const ids = new Set([...pagina.items, ...ultima.items].map((c: { id: string }) => c.id));
    expect(ids.size).toBe(4);

    // Da ficha do cliente, só o que a linha mostra. `customer: true` trazia
    // documento e limite de crédito de cada um para nada.
    for (const conversa of pagina.items) {
      if (conversa.customer) expect(Object.keys(conversa.customer).sort()).toEqual(['id', 'name']);
    }

    // O filtro por situação continua funcionando: virou campo de DTO junto com
    // a paginação, e é assim que ele não vira 400 pelo forbidNonWhitelisted.
    const pendentes = await api(request, loja, 'get', '/whatsapp/conversations?status=PENDING');
    expect(pendentes.total, 'o bot não soube responder: todas ficam pendentes').toBe(NUMEROS.length);

    const busca = await api(request, loja, 'get', '/whatsapp/conversations?search=900000004');
    expect(busca.total).toBe(1);
    expect(busca.items[0].phoneNumber).toBe('+5511900000004');
  });

  test('a conversa não vem inteira, e as mensagens vêm do fim para o começo', async ({ request, loja }) => {
    await inboxComHistorico(request, loja);

    const { items } = await api(request, loja, 'get', '/whatsapp/conversations?search=900000001');
    const conversa = items[0];

    const ficha = await api(request, loja, 'get', `/whatsapp/conversations/${conversa.id}`);
    expect(ficha, 'o cabeçalho não carrega o histórico').not.toHaveProperty('messages');
    expect(ficha._count.messages).toBe(5);

    const recentes = await api(
      request,
      loja,
      'get',
      `/whatsapp/conversations/${conversa.id}/messages?pageSize=2`,
    );
    expect(recentes.total).toBe(5);
    expect(recentes.items).toHaveLength(2);
    // Página 1 é o FIM da conversa: quem abre quer o que acabou de chegar.
    expect(recentes.items[0].content).toBe('Mensagem número 5 desta conversa');
    expect(recentes.items[1].content).toBe('Mensagem número 4 desta conversa');

    const anteriores = await api(
      request,
      loja,
      'get',
      `/whatsapp/conversations/${conversa.id}/messages?pageSize=2&page=3`,
    );
    expect(anteriores.items[0].content, 'a última página é o começo da conversa').toBe(
      'Bom dia, tem pastilha dianteira para Gol 2015?',
    );
  });

  test('abrir o cabeçalho pesa menos que uma página de mensagens', async ({ request, loja }) => {
    await inboxComHistorico(request, loja);
    const { items } = await api(request, loja, 'get', '/whatsapp/conversations?search=900000001');
    const cabecalhos = { Authorization: `Bearer ${loja.accessToken}`, 'x-tenant-slug': loja.slug };

    const ficha = await request.get(`${API_URL}/api/whatsapp/conversations/${items[0].id}`, {
      headers: cabecalhos,
    });
    const mensagens = await request.get(
      `${API_URL}/api/whatsapp/conversations/${items[0].id}/messages?pageSize=50`,
      { headers: cabecalhos },
    );

    // A relação que inverte se alguém devolver o histórico junto com a ficha —
    // e inverte mais quanto mais antiga for a conversa, que é justamente a do
    // cliente que mais compra.
    const bytesDaFicha = (await ficha.body()).length;
    const bytesDasMensagens = (await mensagens.body()).length;
    expect(
      bytesDaFicha,
      `a ficha trouxe ${bytesDaFicha} bytes; uma página de mensagens tem ${bytesDasMensagens}`,
    ).toBeLessThan(bytesDasMensagens);
  });

  test('a conversa abre no fim, que é onde ela está', async ({ paginaLogada: page, request, loja }) => {
    // 40 mensagens, e não 5: com poucas, o painel não chega a rolar, scrollTop
    // é zero de qualquer jeito e a asserção passaria sem provar nada.
    await inboxComHistorico(request, loja, 40);
    await page.goto('/whatsapp');

    await page.getByRole('button', { name: /900000001/ }).click();

    // A espera é DENTRO do painel de propósito. `getByText` na página inteira
    // casa com a prévia da conversa na barra lateral, que mostra justamente a
    // última mensagem — o teste seguia com o painel ainda vazio e media uma
    // lista pela metade. Foi assim que ele acusou 42 px de defeito que não
    // existia.
    const painel = page.getByRole('log', { name: 'Mensagens da conversa' });
    await expect(painel.getByText('Mensagem número 40 desta conversa')).toBeVisible();

    const medida = await painel.evaluate((el) => ({
      rolavel: el.scrollHeight > el.clientHeight,
      faltaAteOFim: el.scrollHeight - el.scrollTop - el.clientHeight,
    }));

    // Sem isto o teste vira decoração: painel que não rola está sempre "no fim".
    expect(medida.rolavel, 'a conversa precisa ser maior que o painel').toBe(true);
    // O painel abria no topo: quem entrava para responder via a mensagem mais
    // antiga e tinha de rolar até embaixo antes de qualquer coisa.
    expect(medida.faltaAteOFim, 'o painel abre rolado até o fim').toBeLessThan(4);
  });

  test('o webhook responde ao provedor com um recibo, não com a conversa', async ({ request, loja }) => {
    const recibo = await api(request, loja, 'post', '/whatsapp/webhook', {
      from: '+5511900000099',
      text: 'Vocês têm amortecedor para Palio?',
    });

    expect(recibo.ok).toBe(true);
    expect(recibo.conversationId).toBeTruthy();
    // O corpo da resposta do webhook vai para o provedor, que o descarta.
    // Mandar o histórico de volta para fora é trabalho para vazar o que
    // ninguém do outro lado vai ler.
    expect(recibo).not.toHaveProperty('messages');
    expect(recibo).not.toHaveProperty('customer');
  });
});
