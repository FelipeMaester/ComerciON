import { api, expect, test } from '../fixtures';

/**
 * Copiar precisa funcionar no computador da loja, não só no do desenvolvedor.
 *
 * `navigator.clipboard` só existe em contexto seguro: HTTPS ou localhost. Abrir
 * o sistema de outro computador do balcão — `http://192.168.x.x`, que é
 * exatamente o cenário do pacote para Windows — deixa o objeto `undefined`.
 *
 * O botão "Copiar link" do orçamento chamava `navigator.clipboard.writeText`
 * direto: estourava um TypeError, não dizia "Copiado!" e não avisava nada.
 * Clica e não acontece nada — o mesmo formato do defeito do botão Excluir, que
 * chegou por relato de quem estava usando.
 *
 * Duas outras telas que copiam já tratavam a falha, com a razão escrita no
 * código. Esta ficou para trás.
 *
 * O teste apaga `writeText` de propósito: é a única forma de exercitar o
 * caminho que a loja percorre e a máquina de quem desenvolve não.
 */
test.describe('copiar fora de HTTPS', () => {
  async function orcamentoPendente(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1]) {
    const cliente = await api(request, loja, 'post', '/customers', {
      name: 'Oficina do Zé',
      type: 'INDIVIDUAL',
    });
    return api(request, loja, 'post', '/quotes', {
      customerId: cliente.id,
      description: 'Revisão',
      items: [{ description: 'Pastilha dianteira', quantity: 2, unitPrice: 180 }],
    });
  }

  test('copia o link do orçamento mesmo sem navigator.clipboard', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    const orcamento = await orcamentoPendente(request, loja);

    // Some com o caminho moderno, deixando a leitura para o teste conferir.
    await page.addInitScript(() => {
      const real = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        get: () => ({ readText: () => real.readText() }),
        configurable: true,
      });
    });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto(`/quotes/${orcamento.id}`);
    const link = await page.locator('input[readonly]').first().inputValue();

    await page.getByRole('button', { name: 'Copiar link' }).click();

    // Não basta a tela dizer que copiou: o que importa é o que está na área
    // de transferência. "Copiado!" sem conteúdo seria a pior das duas falhas.
    await expect(page.getByRole('button', { name: 'Copiado!' })).toBeVisible();
    const naArea = await page.evaluate(() => navigator.clipboard.readText());
    expect(naArea).toBe(link);
  });

  test('quando nem a reserva funciona, a tela diz o que fazer', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    const orcamento = await orcamentoPendente(request, loja);

    // Sem caminho moderno E sem o antigo: o pior cenário possível.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { get: () => undefined, configurable: true });
      document.execCommand = () => false;
    });

    await page.goto(`/quotes/${orcamento.id}`);
    await page.getByRole('button', { name: 'Copiar link' }).click();

    // O link está no campo ao lado, então o que falta é dizer isso — e não
    // deixar a pessoa achando que copiou.
    await expect(page.getByText(/Ctrl\+C/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copiado!' })).toHaveCount(0);
  });
});
