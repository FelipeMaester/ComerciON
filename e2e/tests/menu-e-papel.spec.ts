import { API_URL, api, criarLoja, entrarComo, expect, test } from '../fixtures';
import type { Page } from '@playwright/test';

/**
 * Toda tela que o menu oferece, o papel de quem está olhando consegue abrir.
 *
 * O menu foi ensinado a respeitar o PLANO com cuidado: cada item declara o
 * módulo que o libera, e a lista vem da mesma fonte que o gate da API usa.
 * O PAPEL não teve o mesmo tratamento — o campo `roles` existia e estava
 * preenchido em 3 dos 22 itens.
 *
 * O resultado, medido antes da correção: o vendedor via 19 telas no menu e
 * tomava 403 em 6; o financeiro, em 14; quem cuida do estoque, em 12; o
 * suporte, em 16. E o super admin, em 18 de 21.
 *
 * O pior caso não era nem no menu. O PDV lê `/warehouses` para saber de onde a
 * peça sai, e essa rota era de ADMIN e INVENTORY. A chamada não tinha catch: o
 * 403 sumia, o seletor de depósito ficava vazio sem dizer nada, e finalizar a
 * venda respondia "warehouseId must be a UUID". O vendedor — o papel que existe
 * para vender — não conseguia vender.
 *
 * Por isso este teste NÃO se contenta com "a tela abriu". Ele escuta a rede e
 * reprova qualquer 403, inclusive o engolido em silêncio: era exatamente assim
 * que o defeito do PDV se escondia.
 */
test.describe('menu e papel', () => {
  const PAPEIS = ['SALES', 'FINANCE', 'INVENTORY', 'SUPPORT'] as const;

  /** Os endereços que o menu mostra para quem está logado. */
  async function telasDoMenu(page: Page): Promise<string[]> {
    await page.goto('/ajuda');
    const hrefs = await page.locator('nav a[href^="/"]').evaluateAll((as) =>
      as.map((a) => a.getAttribute('href') ?? ''),
    );
    // Ajuda e Minha conta não pedem papel nenhum e não fazem parte da medida.
    return [...new Set(hrefs)].filter((h) => h && !['/ajuda', '/account'].includes(h));
  }

  for (const papel of PAPEIS) {
    test(`${papel} abre tudo que o menu oferece`, async ({ page, request }) => {
      const loja = await criarLoja(request);
      const email = `${papel.toLowerCase()}@${loja.slug}.teste`;
      await api(request, loja, 'post', '/users', {
        name: `Pessoa ${papel}`,
        email,
        password: loja.senha,
        role: papel,
      });

      const login = await request.post(`${API_URL}/api/auth/login`, {
        headers: { 'x-tenant-slug': loja.slug },
        data: { email, password: loja.senha },
      });
      const tokens = await login.json();
      await entrarComo(page, loja, tokens, papel);

      const telas = await telasDoMenu(page);

      // Controle: o menu não pode estar vazio. Sem isto, esconder tudo de todo
      // mundo passaria neste teste com louvor.
      expect(telas.length, `${papel} ficou sem nenhuma tela no menu`).toBeGreaterThan(2);

      for (const tela of telas) {
        const negados: string[] = [];
        const ouvir = (r: { status(): number; url(): string }) => {
          if (r.status() === 403) negados.push(new URL(r.url()).pathname);
        };
        page.on('response', ouvir);

        await page.goto(tela);
        // Uma batida para as chamadas secundárias da tela saírem — são elas
        // que escondiam o defeito do PDV.
        await page.waitForTimeout(1200);
        page.off('response', ouvir);

        expect(negados, `${papel} vê "${tela}" no menu, mas a tela toma 403`).toEqual([]);
      }
    });
  }
});
