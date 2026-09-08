import { api, expect, test } from '../fixtures';

/**
 * Orçamentos e ordens de serviço traziam a oficina inteira.
 *
 * Medido numa loja com 3.000 orçamentos e 2.500 ordens — dois anos de
 * trabalho:
 *
 *   /quotes .................. 1.610.641 bytes, 27.263 nós no DOM, 123.216 px
 *   /service-orders .......... 1.185.410 bytes, 17.407 nós no DOM,  58.811 px
 *
 * E a tela de orçamentos repetia a consulta A CADA 15 SEGUNDOS para descobrir
 * se algum cliente havia aprovado pelo link: 6,4 MB por minuto de aba aberta,
 * para saber de um "sim" que cabe numa linha.
 *
 * Junto vinham dois defeitos do mesmo tipo, que a paginação transformaria de
 * "pesado" em "errado":
 *
 *   - o botão "ver agenda" filtrava no navegador e passaria a mostrar os
 *     agendados DESTA PÁGINA;
 *   - os contadores por situação ("Atrasadas 7") eram contados no navegador e
 *     passariam a contar a página, não a oficina.
 */
test.describe('oficina', () => {
  async function oficinaComHistorico(
    request: Parameters<typeof api>[0],
    loja: Parameters<typeof api>[1],
  ) {
    const cliente = await api(request, loja, 'post', '/customers', {
      type: 'INDIVIDUAL',
      name: 'Marcos da Silva',
      phone: '11988887777',
    });
    const outro = await api(request, loja, 'post', '/customers', {
      type: 'INDIVIDUAL',
      name: 'Joana Ribeiro',
      phone: '11977776666',
    });
    // 30 orçamentos: mais que uma página de 25, e todos viram ordem de serviço
    // ao serem aprovados.
    for (let i = 1; i <= 30; i++) {
      await api(request, loja, 'post', '/quotes', {
        customerId: i % 3 === 0 ? outro.id : cliente.id,
        description: `Revisão ${i}`,
        items: [{ description: 'Mão de obra', quantity: 1, unitPrice: 100 + i }],
      });
    }
    return { cliente, outro };
  }

  test('orçamentos: uma página por vez, com busca', async ({ request, loja }) => {
    await oficinaComHistorico(request, loja);

    const pagina = await api(request, loja, 'get', '/quotes');
    expect(pagina.total).toBe(30);
    expect(pagina.items).toHaveLength(25);
    expect(pagina.totalPages).toBe(2);

    const segunda = await api(request, loja, 'get', '/quotes?page=2');
    expect(segunda.items).toHaveLength(5);
    const ids = new Set([...pagina.items, ...segunda.items].map((q: { id: string }) => q.id));
    expect(ids.size, 'nenhum orçamento se repete entre as páginas').toBe(30);

    const busca = await api(request, loja, 'get', '/quotes?search=Joana');
    expect(busca.total).toBe(10);
  });

  /**
   * O aviso de aprovação: o que substituiu a comparação de listas inteiras.
   */
  test('orçamentos: o aviso pergunta só o que mudou', async ({ request, loja }) => {
    const { cliente } = await oficinaComHistorico(request, loja);
    const marca = new Date().toISOString();

    const nada = await api(request, loja, 'get', `/quotes/aprovados-desde?desde=${marca}`);
    expect(nada, 'nada foi aprovado desde agora').toEqual([]);

    const novo = await api(request, loja, 'post', '/quotes', {
      customerId: cliente.id,
      description: 'Troca de embreagem',
      items: [{ description: 'Mão de obra', quantity: 1, unitPrice: 900 }],
    });
    await api(request, loja, 'post', `/quotes/${novo.id}/approve`);

    const aprovados = await api(request, loja, 'get', `/quotes/aprovados-desde?desde=${marca}`);
    expect(aprovados).toHaveLength(1);
    expect(aprovados[0].id).toBe(novo.id);
    expect(aprovados[0].customer.name).toBe('Marcos da Silva');
    // Só o que o cartão de aviso precisa: nem itens, nem ordem de serviço,
    // nem a ficha do cliente.
    expect(Object.keys(aprovados[0]).sort()).toEqual(['approvedAt', 'customer', 'id', 'total']);

    // E a marca avança: perguntar de novo a partir do que já foi avisado não
    // repete o aviso.
    const depois = await api(
      request,
      loja,
      'get',
      `/quotes/aprovados-desde?desde=${aprovados[0].approvedAt}`,
    );
    expect(depois).toEqual([]);
  });

  test('orçamentos: "ver agenda" filtra no banco, não na página', async ({ request, loja }) => {
    const { cliente } = await oficinaComHistorico(request, loja);

    // Um orçamento aprovado gera ordem de serviço; agendá-la é o que o coloca
    // na agenda. Ele é criado por ÚLTIMO, então na ordem normal cai na página
    // 1 — o que faria um filtro de navegador acertar por acidente. Por isso a
    // conferência abaixo é sobre o TOTAL, que só a consulta do banco sabe.
    const comAgenda = await api(request, loja, 'post', '/quotes', {
      customerId: cliente.id,
      description: 'Alinhamento e balanceamento',
      items: [{ description: 'Serviço', quantity: 1, unitPrice: 200 }],
    });
    // Aprovar devolve a ORDEM DE SERVIÇO criada, não o orçamento.
    const ordem = await api(request, loja, 'post', `/quotes/${comAgenda.id}/approve`);
    await api(request, loja, 'patch', `/service-orders/${ordem.id}/schedule`, {
      scheduledAt: new Date(Date.now() + 86400_000).toISOString(),
    });

    const agenda = await api(request, loja, 'get', '/quotes?agenda=true');
    expect(agenda.total, 'só o que tem compromisso marcado').toBe(1);
    expect(agenda.items[0].id).toBe(comAgenda.id);
  });

  test('ordens de serviço: os contadores contam a oficina, não a página', async ({ request, loja }) => {
    const { cliente } = await oficinaComHistorico(request, loja);
    // 30 ordens abertas — mais que a página de 25.
    const quotes = await api(request, loja, 'get', '/quotes?pageSize=100');
    for (const q of quotes.items) {
      await api(request, loja, 'post', `/quotes/${q.id}/approve`);
    }

    const pagina = await api(request, loja, 'get', '/service-orders');
    expect(pagina.items, 'a lista vem paginada').toHaveLength(25);
    expect(pagina.total).toBe(30);

    // O número do filtro: 30, e não 25. Contado no navegador sobre a página,
    // diria 25 — plausível, e errado.
    const contagens = await api(request, loja, 'get', '/service-orders/contagens');
    expect(contagens.ABERTAS).toBe(30);
    expect(contagens.OPEN).toBe(30);
    expect(contagens.DONE).toBe(0);
    expect(contagens.ATRASADAS).toBe(0);

    const busca = await api(request, loja, 'get', '/service-orders?search=Joana');
    expect(busca.total).toBe(10);

    // "Atrasada" é agendada para antes de hoje e ainda na bancada. A regra vive
    // no servidor, num arquivo só, compartilhada com o sino de avisos.
    const [primeira] = pagina.items;
    await api(request, loja, 'patch', `/service-orders/${primeira.id}/schedule`, {
      scheduledAt: new Date(Date.now() - 3 * 86400_000).toISOString(),
    });
    const depois = await api(request, loja, 'get', '/service-orders/contagens');
    expect(depois.ATRASADAS).toBe(1);

    const alertas = await api(request, loja, 'get', '/alerts');
    const aviso = alertas.avisos.find((a: { chave: string }) => a.chave === 'ordens-atrasadas');
    expect(
      aviso?.quantidade,
      'o sino e a tela contam a mesma coisa, do mesmo arquivo',
    ).toBe(depois.ATRASADAS);
  });
});
