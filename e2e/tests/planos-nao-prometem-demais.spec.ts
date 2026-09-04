import { expect, test } from '../fixtures';

/**
 * A tela de Assinatura não pode vender o que o produto não faz.
 *
 * A fase de e-commerce (loja virtual, carrinho, checkout, expedição) saiu do
 * produto. Os ModuleKey ECOMMERCE, LOGISTICS e MARKETING ficaram no enum —
 * remover valor de enum no Postgres custa caro, e eles não gateiam nada.
 *
 * Só que o plano Premium continuou concedendo os três, porque era definido por
 * exclusão ("tudo menos AI") e abraçava qualquer valor do enum. A tela lista os
 * módulos concedidos como se fossem o que se leva pelo preço — então a página
 * anunciava "Loja virtual" e "Logística" num plano de R$ 399.
 *
 * Este é o único defeito do dia que custa dinheiro de quem compra, e não tempo
 * de quem usa: é promessa comercial que o sistema não tem como cumprir.
 */
test.describe('planos', () => {
  test('nenhum plano anuncia função que saiu do produto', async ({ paginaLogada: page }) => {
    await page.goto('/billing');
    await expect(page.getByRole('heading', { name: 'Assinatura' })).toBeVisible();

    // Controle primeiro: a lista carregou mesmo. Sem isto, uma tela vazia (ou
    // que falhou ao carregar os planos) passaria — não anunciar nada também
    // satisfaz "não anuncia loja virtual".
    await expect(page.getByText('Planos disponíveis')).toBeVisible();
    await expect(page.getByText(/Vendas e PDV/).first()).toBeVisible();

    await expect(page.getByText(/Loja virtual/i)).toHaveCount(0);
    await expect(page.getByText(/Logística/i)).toHaveCount(0);
    await expect(page.getByText(/Marketing/i)).toHaveCount(0);
  });

  test('o plano gratuito se chama "Avaliação", e não "Trial"', async ({ paginaLogada: page }) => {
    // O nome aparece aqui e dentro da mensagem que barra um módulo ("não está
    // incluído no seu plano atual"). Era a única palavra em inglês que chegava
    // ao lojista — traduzida no seed, mas a migration, que é quem cria os
    // planos em produção, tinha ficado para trás.
    await page.goto('/billing');

    await expect(page.getByText('Avaliação').first()).toBeVisible();
    await expect(page.getByText(/\bTrial\b/)).toHaveCount(0);
  });
});
