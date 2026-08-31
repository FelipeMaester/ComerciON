import { api, expect, test } from '../fixtures';

/**
 * O que a tela diz que vai acontecer quando o lojista aperta "Emitir".
 *
 * O aviso era fixo no código — "Emissão simulada nesta fase, sem integração
 * real com a SEFAZ" — escrito quando só existia o provedor simulado. Depois
 * entrou o Focus NFe, e a frase ficou. Uma loja emitindo NF-e com valor legal
 * continuava lendo na tela que aquilo era simulação.
 *
 * É o único lugar do sistema em que acreditar na tela errada tem consequência
 * fora dele: nota emitida por engano não se desfaz apagando um registro — pede
 * cancelamento junto à SEFAZ, dentro de prazo, e às vezes nem isso resolve.
 *
 * Os três estados são exercitados interceptando a resposta da API, e não
 * trocando a configuração: sem token do Focus, o sistema cai no simulado, e o
 * estado perigoso — produção — nunca seria alcançado num teste.
 */
test.describe('aviso do modo fiscal', () => {
  /** Uma venda confirmada, que é onde o botão de emitir aparece. */
  async function vendaConfirmada(
    request: Parameters<typeof api>[0],
    loja: Parameters<typeof api>[1],
  ) {
    const deposito = (await api(request, loja, 'get', '/warehouses'))[0];
    const produto = await api(request, loja, 'post', '/products', {
      sku: 'FIS-001',
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
    return api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      items: [{ productId: produto.id, quantity: 1, unitPrice: 320 }],
      payments: [{ method: 'CASH', amount: 320 }],
      confirm: true,
    });
  }

  /** Abre a venda com a API respondendo o modo pedido. */
  async function abrirCom(
    page: Parameters<typeof test>[1] extends never ? never : import('@playwright/test').Page,
    vendaId: string,
    modo: string,
  ) {
    await page.route(/\/fiscal\/invoices\/modo$/, (rota) =>
      rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modo }) }),
    );
    await page.goto(`/sales/${vendaId}`);
    await expect(page.getByRole('heading', { name: 'Nota fiscal' })).toBeVisible();
  }

  test('produção avisa que a nota tem valor fiscal', async ({ paginaLogada: page, request, loja }) => {
    // O estado perigoso. Um aviso discreto aqui seria pior que nenhum: quem lê
    // "simulada" emite sem pensar duas vezes.
    const venda = await vendaConfirmada(request, loja);
    await abrirCom(page, venda.id, 'producao');

    await expect(page.getByText(/tem valor fiscal/i)).toBeVisible();
    await expect(page.getByText(/simulad/i)).toHaveCount(0);
  });

  test('homologação avisa que a nota NÃO tem valor fiscal', async ({ paginaLogada: page, request, loja }) => {
    const venda = await vendaConfirmada(request, loja);
    await abrirCom(page, venda.id, 'homologacao');

    await expect(page.getByText(/homologação/i)).toBeVisible();
    await expect(page.getByText(/não tem valor fiscal/i)).toBeVisible();
  });

  test('simulado diz que nada é enviado à SEFAZ', async ({ paginaLogada: page, request, loja }) => {
    const venda = await vendaConfirmada(request, loja);
    await abrirCom(page, venda.id, 'simulado');

    await expect(page.getByText(/nada é enviado à SEFAZ/i)).toBeVisible();
  });

  test('sem saber o modo, a tela não afirma nada', async ({ paginaLogada: page, request, loja }) => {
    // Controle, e a regra que faltava: o padrão anterior era afirmar
    // "simulada" sem consultar ninguém. Na dúvida, calar é mais honesto que
    // chutar o estado que dá menos medo.
    const venda = await vendaConfirmada(request, loja);

    await page.route(/\/fiscal\/invoices\/modo$/, (rota) => rota.fulfill({ status: 500, body: '{}' }));
    await page.goto(`/sales/${venda.id}`);
    await expect(page.getByRole('heading', { name: 'Nota fiscal' })).toBeVisible();

    await expect(page.getByText(/simulad|valor fiscal|SEFAZ/i)).toHaveCount(0);
  });
});
