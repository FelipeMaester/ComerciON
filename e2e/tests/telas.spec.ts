import { test, expect } from '../fixtures';

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
