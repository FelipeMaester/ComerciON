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
