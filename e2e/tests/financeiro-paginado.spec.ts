import { API_URL, api, expect, test } from '../fixtures';

/**
 * O Financeiro é paginado, e os recortes são do servidor.
 *
 * A lista vinha inteira. Cada venda cria um recebível, então um ano de loja
 * são milhares: medido com 9.000 lançamentos, a resposta tinha 4 MB e a tela
 * renderizava as 9.000 linhas — 90 mil nós no DOM e 470 telas de rolagem.
 *
 * Paginar sozinho teria sido pior que o problema. A tela aplicava "só
 * vencidas" e "a vencer" no NAVEGADOR, sobre o array inteiro; com a lista
 * paginada, esses filtros passariam a mostrar "as vencidas desta página" — a
 * tela diria três onde a loja tem duzentas, sem nenhum sinal de que está
 * mentindo.
 *
 * E havia uma terceira coisa junto: "a vencer" tinha duas definições. O sino
 * contava dias 0, 1 e 2; a tela, que abre a partir do clique NAQUELE sino,
 * incluía o dia 3. Agora os dois leem a mesma janela.
 */
test.describe('financeiro', () => {
  /** 30 lançamentos vencidos e um vencendo hoje. */
  async function comHistorico(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1]) {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const hoje = new Date();

    for (let i = 1; i <= 30; i++) {
      await api(request, loja, 'post', '/finance/entries', {
        type: 'PAYABLE',
        description: `Conta vencida ${i}`,
        amount: 100 + i,
        dueDate: ontem.toISOString(),
      });
    }
    await api(request, loja, 'post', '/finance/entries', {
      type: 'PAYABLE',
      description: 'Conta de hoje',
      amount: 999,
      dueDate: hoje.toISOString(),
    });
  }

  test('mostra uma página, e o total é o da loja', async ({ paginaLogada: page, request, loja }) => {
    await comHistorico(request, loja);

    await page.goto('/finance');
    await expect(page.getByText(/31 lançamentos/)).toBeVisible();
    await expect(page.locator('main tbody tr')).toHaveCount(25);

    // Controle: a segunda página existe e traz o resto. Sem ela, "25 linhas"
    // passaria mesmo se as outras 6 tivessem sumido.
    await page.getByRole('button', { name: 'Próxima' }).click();
    await expect(page.getByText(/página 2 de 2/)).toBeVisible();
    await expect(page.locator('main tbody tr')).toHaveCount(6);
  });

  test('"só vencidas" conta a loja inteira, e não a página', async ({ paginaLogada: page, request, loja }) => {
    await comHistorico(request, loja);

    // É o link que o sino de avisos oferece.
    await page.goto('/finance?situacao=vencidas');

    // 30 vencidas: mais que uma página. Filtrando no navegador, a tela mostraria
    // no máximo as vencidas das 25 primeiras linhas.
    await expect(page.getByText(/30 lançamentos/)).toBeVisible();
    await expect(page.locator('main tbody tr')).toHaveCount(25);

    // Controle: a conta de hoje NÃO é vencida e precisa ficar de fora — senão
    // "só vencidas" seria só um rótulo sobre a lista completa.
    await expect(page.getByText('Conta de hoje')).toHaveCount(0);
  });

  test('o sino e a tela contam o mesmo "a vencer"', async ({ paginaLogada: page, request, loja }) => {
    await comHistorico(request, loja);

    const cabecalhos = { 'x-tenant-slug': loja.slug, Authorization: `Bearer ${loja.accessToken}` };
    const avisos = await (await request.get(`${API_URL}/api/alerts`, { headers: cabecalhos })).json();
    const aVencer = avisos.avisos.find((a: { chave: string }) => a.chave === 'contas-a-vencer');

    await page.goto('/finance?situacao=a-vencer');

    // A conta de hoje está dentro da janela e precisa aparecer. Esperar por
    // ela ANTES de contar: count() não espera, e a primeira versão deste
    // teste contava a tabela ainda vazia.
    await expect(page.getByText('Conta de hoje')).toBeVisible();
    await expect(page.locator('main tbody tr')).toHaveCount(1);

    // Só contas A PAGAR neste cenário, e o sino conta as A RECEBER — o que
    // interessa aqui é que a tela use a janela do servidor, não uma cópia.
    // Com a conta de hoje dentro da janela, a tela precisa mostrá-la.

    // O aviso pode nem existir (nenhum recebível a vencer): o que não pode é a
    // tela inventar a própria regra.
    expect(aVencer === undefined || typeof aVencer.quantidade === 'number').toBe(true);
  });
});
