import { api, test, expect } from '../fixtures';

/**
 * Toda tela abre, em loja vazia, sem erro e sem rolagem lateral.
 *
 * Nasceu junto com a repaginação do visual: a troca de classes foi mecânica e
 * atingiu 38 arquivos, e uma classe removida a mais em qualquer um deles não
 * quebra o type-check nem os testes unitários — some silenciosamente na tela
 * que ninguém abriu. Este teste abre todas.
 *
 * A loja é recém-criada de propósito: o estado vazio é justamente o que menos
 * se olha durante o desenvolvimento, e é o primeiro que um cliente novo vê.
 */
const TELAS = [
  '/dashboard',
  '/pos',
  '/cash',
  '/sales',
  '/quotes',
  '/service-orders',
  '/products',
  '/stock-counts',
  '/suppliers',
  '/customers',
  '/whatsapp',
  '/pipeline',
  '/tasks',
  '/finance',
  '/finance/cashflow',
  '/reports',
  '/automations',
  '/coupons',
  '/users',
  '/billing',
  '/settings',
  '/account',
];

test('toda tela do painel abre sem erro e cabe na largura', async ({ paginaLogada: page }) => {
  const problemas: string[] = [];
  page.on('pageerror', (e) => problemas.push(`${page.url()} — erro de execução: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Requisição bloqueada/404 de recurso não é defeito de tela.
    if (/favicon|Failed to load resource/i.test(m.text())) return;
    problemas.push(`${page.url()} — console: ${m.text()}`);
  });

  for (const tela of TELAS) {
    await page.goto(tela);

    // Cada tela tem um título; se ele aparece, o React renderizou até o fim.
    await expect(page.locator('h1').first(), `${tela} não renderizou`).toBeVisible({ timeout: 15_000 });

    const medida = await page.evaluate(() => ({
      largura: document.documentElement.scrollWidth,
      janela: window.innerWidth,
    }));
    expect(medida.largura, `${tela} rola de lado`).toBeLessThanOrEqual(medida.janela + 1);
  }

  expect(problemas, problemas.join('\n')).toEqual([]);
});

/**
 * O mesmo passeio, com o computador no tema escuro.
 *
 * Existe porque o teste acima abre o navegador no claro — padrão do Playwright
 * — e foi por essa fresta que um erro de hidratação passou despercebido. O
 * ícone do botão de tema é decidido por `matchMedia`, que não existe no
 * servidor: para quem usa o computador no escuro, o HTML que vinha pronto do
 * servidor não batia com o que o navegador desenhava, e o React descartava a
 * árvore inteira para redesenhar tudo no cliente. Em toda visita, de graça.
 *
 * Não aparecia na tela — o ícone fica invisível até o navegador se pronunciar.
 * Aparecia só no console, que é onde este teste olha.
 */
test.describe('com o computador no tema escuro', () => {
  test.use({ colorScheme: 'dark' });

  test('a tela de entrada hidrata sem divergir do que o servidor mandou', async ({ page }) => {
    const problemas: string[] = [];
    // `pageerror`, e não só o console: em build de produção o erro de
    // hidratação chega como exceção não capturada. A primeira versão deste
    // teste só escutava o console e passava com o defeito no lugar.
    page.on('pageerror', (e) => problemas.push(`${page.url()} — erro de execução: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (/favicon|Failed to load resource/i.test(m.text())) return;
      problemas.push(`${page.url()} — console: ${m.text()}`);
    });

    // A tela de entrada, e não as internas: é a que o servidor desenha por
    // inteiro, barra do topo incluída. Nas telas de dentro a barra só monta no
    // navegador, então não há o que divergir — a segunda versão deste teste
    // olhava para elas e por isso não via nada.
    await page.goto('/login');
    await expect(page.locator('form').first()).toBeVisible({ timeout: 15_000 });
    // A hidratação acontece logo depois da tela aparecer; sem esta folga o
    // teste termina antes de o React reclamar.
    await page.waitForTimeout(1_500);

    expect(problemas, problemas.join(String.fromCharCode(10))).toEqual([]);
  });
});


/**
 * Janela estreita: onde o conteúdo passa a não caber na própria caixa.
 *
 * O teste acima já garante que a página não rola de lado, e mesmo assim um
 * defeito passou por baixo dele: no painel, os quatro indicadores ficavam numa
 * fila só a partir de 640px, e com a barra lateral comendo 245px sobrava 120px
 * por cartão. "R$ 550,00" precisa de 117px e recebia 88px — o valor era cortado
 * e encostava no vizinho. A página não rolava de lado porque o estouro era
 * dentro de um cartão, não do documento.
 *
 * A medida certa é outra: nenhum elemento pode precisar de mais largura do que
 * a caixa dele tem.
 */
test.describe("em janela estreita", () => {
  test.use({ viewport: { width: 780, height: 900 } });

  test("nenhum valor é cortado pela própria caixa", async ({ paginaLogada: page, request, loja }) => {
    // Uma venda de valor alto, e este é o ponto do teste: a loja recém-criada
    // mostra "R$ 0,00" em tudo, e número curto nunca estoura. A primeira versão
    // deste teste media a loja vazia e passava em qualquer largura — não
    // testava nada. O defeito precisa de um número longo para existir.
    const [deposito] = await api(request, loja, "get", "/warehouses");
    const produto = await api(request, loja, "post", "/products", {
      sku: "LARGO-001",
      name: "Peça cara",
      price: 12120.41,
      costPrice: 6000,
      minStock: 0,
    });
    await api(request, loja, "post", "/inventory/stock/adjust", {
      productId: produto.id,
      warehouseId: deposito.id,
      type: "IN",
      quantity: 5,
      reason: "carga do teste",
    });
    const venda = await api(request, loja, "post", "/sales", {
      warehouseId: deposito.id,
      items: [{ productId: produto.id, quantity: 1, unitPrice: 12120.41 }],
    });
    await api(request, loja, "post", "/sales/" + venda.id + "/confirm", {
      payments: [{ method: "PIX", amount: 12120.41 }],
    });

    await page.goto("/dashboard");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("R$ 12.120,41").first(), "o valor longo precisa estar na tela").toBeVisible();

    const apertados = await page.evaluate(() => {
      const fora: string[] = [];
      for (const el of Array.from(document.querySelectorAll("main *"))) {
        const st = getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") continue;
        // Quem rola de propósito (tabela larga) não é defeito.
        if (st.overflowX !== "visible") continue;
        if (el.scrollWidth <= el.clientWidth + 1) continue;
        const texto = (el.textContent ?? "").trim().slice(0, 30);
        fora.push(texto + " — cabe " + el.clientWidth + "px, precisa " + el.scrollWidth + "px");
      }
      return fora;
    });

    expect(apertados, apertados.join(String.fromCharCode(10))).toEqual([]);
  });
});
