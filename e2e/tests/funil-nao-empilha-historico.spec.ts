import { api, expect, test } from '../fixtures';

/**
 * O quadro do funil mostra o trabalho em aberto, não o arquivo morto.
 *
 * A rota devolvia TODAS as oportunidades e a tela distribuía por etapa no
 * navegador. Um funil saudável tem poucas oportunidades abertas — mas as
 * etapas terminais nunca esvaziam: nada sai de "Ganho" nem de "Perdido".
 *
 * Medido com dois anos de funil (1.200 oportunidades): 966 KB de resposta,
 * 75% dela de negócios já fechados, e uma página de 61.698 pixels — 68 telas
 * de rolagem, porque a coluna "Ganho" empilhava 480 cartões.
 *
 * Limitar sozinho teria sido pior que o problema: o cabeçalho de cada coluna
 * mostra a contagem e a soma, e a tela as calculava sobre o array recebido.
 * A coluna diria 25 onde a loja tem 480 — e ninguém desconfiaria, porque o
 * número parece certo.
 */
test.describe('funil de vendas', () => {
  /** 30 oportunidades na primeira etapa: mais do que uma coluna mostra. */
  async function funilCheio(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1]) {
    const cliente = await api(request, loja, 'post', '/customers', { name: 'Mecânica do Teste', type: 'COMPANY' });
    const etapas = await api(request, loja, 'get', '/pipeline-stages');
    const primeira = [...etapas].sort((a, b) => a.order - b.order)[0];

    for (let i = 1; i <= 30; i++) {
      await api(request, loja, 'post', '/opportunities', {
        customerId: cliente.id,
        stageId: primeira.id,
        title: `Orçamento ${i}`,
        estimatedValue: 100,
      });
    }
    return primeira;
  }

  test('a coluna mostra 25 cartões e conta os 30 da loja', async ({ paginaLogada: page, request, loja }) => {
    const etapa = await funilCheio(request, loja);

    await page.goto('/pipeline');
    const coluna = page.locator('div').filter({ hasText: new RegExp(`^${etapa.name}30`) }).first();
    await expect(coluna).toBeVisible();

    // 25 cartões desenhados...
    await expect(coluna.getByText(/^Orçamento \d+$/)).toHaveCount(25);
    // ...e o cabeçalho dizendo a verdade sobre a loja.
    await expect(coluna.getByText('30', { exact: true })).toBeVisible();
    // ...e o recado do que ficou de fora, para ninguém achar que são 25.
    await expect(coluna.getByText('+ 5 mais antigas')).toBeVisible();
  });

  test('a soma da coluna é a da loja, não a dos cartões visíveis', async ({ paginaLogada: page, request, loja }) => {
    await funilCheio(request, loja);

    await page.goto('/pipeline');

    // 30 × R$ 100 = R$ 3.000. Somando só os 25 desenhados daria R$ 2.500 —
    // um número plausível, e errado, que ninguém questionaria.
    await expect(page.getByText('R$ 3.000,00')).toBeVisible();
    await expect(page.getByText('R$ 2.500,00')).toHaveCount(0);
  });

  test('coluna que cabe inteira não ganha recado', async ({ paginaLogada: page, request, loja }) => {
    // Controle: o recado só existe quando há algo escondido. Aparecer sempre
    // seria ruído, e ruído treina a pessoa a ignorar o que importa.
    const cliente = await api(request, loja, 'post', '/customers', { name: 'Oficina Pequena', type: 'COMPANY' });
    const etapas = await api(request, loja, 'get', '/pipeline-stages');
    await api(request, loja, 'post', '/opportunities', {
      customerId: cliente.id,
      stageId: [...etapas].sort((a, b) => a.order - b.order)[0].id,
      title: 'Orçamento único',
      estimatedValue: 100,
    });

    await page.goto('/pipeline');
    await expect(page.getByText('Orçamento único')).toBeVisible();
    await expect(page.getByText(/mais antigas?/)).toHaveCount(0);
  });
});
