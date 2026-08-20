import { api, expect, test } from '../fixtures';

/**
 * "Analisar meu negócio", na tela de Automações.
 *
 * Relatado pelo lojista como "não está funcionando", e era: o clique disparava
 * a análise, o servidor concluía que não havia o que sugerir — e jogava a
 * conclusão fora. A tela relia, recebia "nunca analisou" e redesenhava o mesmo
 * estado inicial. Nenhum erro, nenhuma mudança, nada. E a loja em dia, que é o
 * melhor caso possível, era justamente a única que nunca recebia resposta.
 */
test.describe('análise de automações', () => {
  test('loja sem pendências recebe resposta, e não o mesmo convite de novo', async ({
    paginaLogada: page,
    loja,
  }) => {
    await page.goto('/automations');
    await expect(page.getByText('O sistema ainda não analisou o seu negócio.')).toBeVisible();

    await page.getByRole('button', { name: 'Analisar meu negócio' }).click();

    // O que prova o defeito corrigido: a tela passa a dizer QUANDO analisou.
    // Antes ela voltava para "ainda não analisou", e o botão parecia morto.
    await expect(page.getByText(/Última análise em/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Analisar de novo' })).toBeVisible();
    await expect(page.getByText(/Não há movimento suficiente/)).toBeVisible();

    // E continua valendo depois de recarregar: o registro está no banco, não
    // só no estado da tela. Era exatamente isso que faltava.
    await page.reload();
    await expect(page.getByText(/Última análise em/), `a loja ${loja.slug} esqueceu que analisou`).toBeVisible();
  });

  /**
   * A outra metade do "não funciona": responder é pouco, tem de sugerir.
   *
   * O sinal escolhido é estoque baixo porque basta uma peça — as outras regras
   * pedem volume (três contas vencidas, dois orçamentos parados, cinco clientes
   * sumidos), e com razão: uma conta atrasada não justifica montar automação.
   * Um teste que criasse só uma delas passaria a impressão errada de que a
   * análise está quebrada quando ela está apenas sendo criteriosa.
   */
  test('loja com estoque baixo recebe sugestão pronta para ativar', async ({ paginaLogada: page, request, loja }) => {
    await api(request, loja, 'post', '/products', {
      sku: 'SEM-ESTOQUE-1',
      name: 'Peça sem estoque',
      price: 100,
      costPrice: 40,
      minStock: 5,
    });

    await page.goto('/automations');
    await page.getByRole('button', { name: 'Analisar meu negócio' }).click();

    await expect(page.getByText(/Última análise em/)).toBeVisible();
    await expect(page.getByText(/Não há movimento suficiente/)).toHaveCount(0);
    await expect(page.getByText(/estoque/i).first()).toBeVisible();
    // A sugestão vem pronta para virar automação com um clique.
    await expect(page.getByRole('button', { name: 'Ativar' }).first()).toBeVisible();
  });
});
