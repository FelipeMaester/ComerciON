import { api, expect, test } from '../fixtures';

/**
 * Os gráficos do dashboard.
 *
 * Gráfico é a parte da interface em que "compila" e "está certo" moram mais
 * longe um do outro: um SVG com o caminho errado desenha uma curva bonita e
 * mentirosa, e nenhum type-check percebe. Os testes aqui olham a geometria do
 * traço, não a aparência.
 *
 * Dois defeitos concretos que estes testes pegam:
 *
 *   1. O gráfico sumia por completo. Ele só se desenha depois de medir a
 *      largura do container, e a medida vinha só do ResizeObserver — que é
 *      entregue junto com o desenho do quadro. Onde o quadro demora (aba em
 *      segundo plano, navegador sem composição), a caixa ficava vazia para
 *      sempre. Medido num navegador real, com o gráfico ausente na tela.
 *
 *      Nota sobre este: no Chromium do Playwright o ResizeObserver dispara
 *      normalmente, então abrir a página não reproduz nada — conferido, com o
 *      defeito no lugar e os quatro testes passando. Quem cobre isso é o teste
 *      que desliga o ResizeObserver de propósito, no fim do arquivo.
 *
 *   2. A curva passava abaixo de zero. Entre um dia sem venda e outro de
 *      R$ 3.000, a spline ingênua mergulha antes de subir, e o gráfico mostra
 *      faturamento negativo — que não existe no sistema.
 */

/** Cria uma venda confirmada e paga, para haver o que desenhar. */
async function venderUmaPeca(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1], valor: number) {
  const [deposito] = await api(request, loja, 'get', '/warehouses');
  const produto = await api(request, loja, 'post', '/products', {
    sku: `GRAF-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Peça do gráfico',
    price: valor,
    costPrice: valor / 2,
    minStock: 0,
  });
  await api(request, loja, 'post', '/inventory/stock/adjust', {
    productId: produto.id,
    warehouseId: deposito.id,
    type: 'IN',
    quantity: 10,
    reason: 'carga do teste',
  });

  const venda = await api(request, loja, 'post', '/sales', {
    warehouseId: deposito.id,
    items: [{ productId: produto.id, quantity: 1, unitPrice: valor }],
  });
  await api(request, loja, 'post', `/sales/${venda.id}/confirm`, {
    payments: [{ method: 'PIX', amount: valor }],
  });
  return venda;
}

test.describe('gráficos do dashboard', () => {
  test('o gráfico de faturamento aparece e desenha um ponto por dia', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    await venderUmaPeca(request, loja, 3000);

    await page.goto('/dashboard');

    const grafico = page.locator('svg[role="img"]');
    await expect(grafico).toBeVisible();

    // A largura precisa ser a do container de verdade. Zero significa que a
    // medida não chegou — que é exatamente como o gráfico sumia.
    const largura = Number(await grafico.getAttribute('width'));
    expect(largura).toBeGreaterThan(100);

    await expect(grafico).toHaveAttribute('aria-label', /Gráfico de 30 pontos/);

    // 30 pontos ligados por curvas cúbicas = 29 segmentos. Menos que isso
    // significa que a série chegou furada ou foi recortada errado.
    const d = (await grafico.locator('path[pathLength]').getAttribute('d')) ?? '';
    expect(d.split('C').length - 1).toBe(29);
  });

  test('a curva nunca desce abaixo do zero, mesmo com dias sem venda', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    // Uma venda alta hoje, e os 29 dias anteriores zerados: é o degrau que
    // faz uma spline mal feita mergulhar no negativo.
    await venderUmaPeca(request, loja, 3000);

    await page.goto('/dashboard');
    const grafico = page.locator('svg[role="img"]');
    await expect(grafico).toBeVisible();

    // Percorre a curva de verdade, com a medição do próprio SVG, em vez de
    // reinterpretar o atributo `d` à mão.
    const extremos = await grafico.locator('path[pathLength]').evaluate((linha: SVGPathElement) => {
      const total = linha.getTotalLength();
      let maiorY = -Infinity;
      let menorY = Infinity;
      for (let i = 0; i <= 400; i++) {
        const ponto = linha.getPointAtLength((i / 400) * total);
        maiorY = Math.max(maiorY, ponto.y);
        menorY = Math.min(menorY, ponto.y);
      }
      return { maiorY, menorY };
    });

    const altura = Number(await grafico.getAttribute('height'));
    const TOPO = 12;
    const BASE = 22;
    const yDoZero = altura - BASE;

    // Em SVG o y cresce para baixo: passar do y do zero é faturamento negativo.
    expect(extremos.maiorY).toBeLessThanOrEqual(yDoZero + 0.5);
    expect(extremos.menorY).toBeGreaterThanOrEqual(TOPO - 0.5);
  });

  test('a rosca de formas de pagamento mostra uma fatia por forma usada', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    await venderUmaPeca(request, loja, 500);

    await page.goto('/dashboard');

    const rosca = page.locator('circle[stroke-dasharray]');
    await expect(rosca).toHaveCount(1);
    await expect(page.getByText('PIX', { exact: true })).toBeVisible();
    await expect(page.getByText('100%')).toBeVisible();
  });

  test('o gráfico aparece mesmo se o ResizeObserver nunca entregar nada', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    await venderUmaPeca(request, loja, 1200);

    // ResizeObserver que aceita `observe` e nunca chama de volta. É o
    // comportamento observado num navegador que não está compondo quadros: a
    // entrega do ResizeObserver acontece no ciclo de desenho, e sem desenho
    // ela não acontece. Com a medida vindo só dele, o gráfico ficava eterna-
    // mente numa caixa vazia.
    await page.addInitScript(() => {
      class Silencioso {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      (window as unknown as { ResizeObserver: unknown }).ResizeObserver = Silencioso;
    });

    await page.goto('/dashboard');

    const grafico = page.locator('svg[role="img"]');
    await expect(grafico).toBeVisible();
    expect(Number(await grafico.getAttribute('width'))).toBeGreaterThan(100);
  });

  test('sem venda nenhuma, o lugar do gráfico explica em vez de ficar em branco', async ({
    paginaLogada: page,
  }) => {
    await page.goto('/dashboard');

    await expect(page.getByText(/Nenhuma venda confirmada nos últimos 30 dias/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Abrir o PDV/ })).toBeVisible();
    // Gráfico vazio desenhado numa escala inventada seria pior que não ter.
    await expect(page.locator('svg[role="img"]')).toHaveCount(0);
  });
});
