import { api, expect, test } from '../fixtures';

/**
 * Excluir precisa funcionar sempre, e o `window.confirm` não funciona sempre.
 *
 * Depois de algumas confirmações seguidas, o Chrome oferece "impedir que esta
 * página crie mais diálogos". Marcada a caixa, `confirm()` passa a devolver
 * `false` na hora, sem mostrar nada — e o botão Excluir deixa de fazer
 * qualquer coisa, sem explicação, para sempre.
 *
 * Não é hipótese: aconteceu no fechamento de caixa, foi corrigido lá e em
 * Vendas com confirmação dentro da tela, e duas telas ficaram para trás.
 * O defeito voltou por relato de quem estava usando: "clico em excluir e ela
 * não exclui".
 *
 * Estes testes olham as duas telas que faltavam. O que eles garantem é que
 * NENHUM diálogo nativo é usado — porque é o nativo que o navegador cala.
 */
test.describe('excluir sem diálogo nativo', () => {
  test('automação: confirma na tela, e o aviso diz o que se perde', async ({ paginaLogada: page, request, loja }) => {
    await api(request, loja, 'post', '/automation-rules', {
      name: 'Regra de teste',
      trigger: 'RECEIVABLE_DUE_IN_DAYS',
      triggerConfig: { days: 3 },
      action: 'SEND_WHATSAPP',
      actionConfig: { messageTemplate: 'Olá, {{customerName}}!' },
      isActive: true,
    });

    // Se a tela abrir um diálogo nativo, o navegador de teste o dispensa e a
    // exclusão não acontece — que é exatamente o defeito relatado.
    let nativo = false;
    page.on('dialog', async (d) => {
      nativo = true;
      await d.dismiss();
    });

    await page.goto('/automations');
    await expect(page.getByText('Regra de teste')).toBeVisible();

    await page.getByRole('button', { name: 'Excluir', exact: true }).first().click();

    // A confirmação é um diálogo DA TELA, com o nome da regra no título.
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Regra de teste');

    await page.getByRole('button', { name: 'Excluir a automação' }).click();

    await expect(page.getByText('Regra de teste')).toHaveCount(0);
    expect(nativo, 'nenhum window.confirm pode ser usado: o navegador cala esse').toBe(false);
  });

  test('automação: dá para voltar atrás sem excluir', async ({ paginaLogada: page, request, loja }) => {
    // Controle: confirmar tem que ser uma escolha, não um pedágio. Se "Voltar"
    // também excluísse, o teste acima passaria e a tela seria uma armadilha.
    await api(request, loja, 'post', '/automation-rules', {
      name: 'Regra que fica',
      trigger: 'RECEIVABLE_DUE_IN_DAYS',
      triggerConfig: { days: 3 },
      action: 'SEND_WHATSAPP',
      actionConfig: { messageTemplate: 'Olá!' },
      isActive: true,
    });

    await page.goto('/automations');
    await page.getByRole('button', { name: 'Excluir', exact: true }).first().click();
    await page.getByRole('button', { name: 'Voltar' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Regra que fica')).toBeVisible();
  });

  test('categoria: o aviso diz quantas peças ficam sem classificação', async ({ paginaLogada: page, request, loja }) => {
    const categoria = await api(request, loja, 'post', '/categories', { name: 'Suspensão' });
    await api(request, loja, 'post', '/products', {
      sku: 'AMORT-001',
      name: 'Amortecedor dianteiro',
      price: 200,
      costPrice: 100,
      categoryId: categoria.id,
    });

    let nativo = false;
    page.on('dialog', async (d) => {
      nativo = true;
      await d.dismiss();
    });

    await page.goto('/categories');
    await page.getByRole('row', { name: /Suspensão/ }).getByRole('button', { name: 'Excluir' }).click();

    // O número é o ponto: apagar a categoria não apaga a peça, e ninguém
    // descobre isso depois — a peça só fica sem classificação, em silêncio.
    await expect(page.getByRole('dialog')).toContainText('1 peça(s)');
    await expect(page.getByRole('dialog')).toContainText('não são apagadas');

    await page.getByRole('button', { name: 'Excluir a categoria' }).click();
    await expect(page.getByText('Suspensão')).toHaveCount(0);
    expect(nativo, 'nenhum window.confirm pode ser usado').toBe(false);
  });
});
