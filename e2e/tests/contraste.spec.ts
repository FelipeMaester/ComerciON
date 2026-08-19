import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';

/**
 * Legibilidade nos dois temas, medida em vez de conferida a olho.
 *
 * Existe porque um defeito de tema não parece defeito: a tela abre, nada quebra
 * e o texto simplesmente some no fundo. Só se percebe quem usa o painel no tema
 * em que aquele elemento é ilegível. Foi assim com o seletor de período do
 * gráfico — no claro estava certo, no escuro dava 2,64:1 — e com o número do
 * sino de avisos, branco sobre âmbar, ilegível nos dois.
 *
 * A regra é a mesma da WCAG AA: 4,5:1 para texto comum, 3:1 para texto grande.
 */

/** Mínimos aceitos, iguais aos da WCAG AA. */
const MINIMO_COMUM = 4.5;
const MINIMO_GRANDE = 3;

interface Achado {
  texto: string;
  razao: number;
  cor: string;
  fundo: string;
  tamanho: number;
}

/**
 * Mede o contraste de todo texto visível contra o fundo que está atrás dele.
 *
 * Sobe pelos pais até achar um fundo opaco, que é como o olho enxerga: um
 * elemento transparente mostra o fundo de quem está atrás, não branco.
 */
async function medirContraste(page: Page): Promise<Achado[]> {
  return page.evaluate(
    ([minComum, minGrande]) => {
      const lum = (c: number[]) => {
        const [r, g, b] = c.map((v) => {
          const n = v / 255;
          return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const cor = (s: string) => {
        const m = s.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(',').map(Number);
        return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
      };
      // Degradê e imagem de fundo não têm cor única para comparar. Quem estiver
      // sobre um deles é pulado, não reprovado: medir errado e acusar é pior do
      // que não medir. Foi o que aconteceu na primeira versão — as iniciais da
      // loja, brancas sobre um degradê colorido, apareceram como 1,07:1 porque
      // o medidor enxergava o fundo da página atrás delas.
      const temImagem = (el: Element) => getComputedStyle(el).backgroundImage !== 'none';
      const fundoDe = (el: Element): number[] | null => {
        let n: Element | null = el;
        while (n && n !== document.documentElement) {
          if (temImagem(n)) return null;
          const c = cor(getComputedStyle(n).backgroundColor);
          if (c && c.a > 0.5) return c.rgb;
          n = n.parentElement;
        }
        return cor(getComputedStyle(document.body).backgroundColor)?.rgb ?? [255, 255, 255];
      };

      const achados: Achado[] = [];
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const texto = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => (n.textContent ?? '').trim())
          .join('');
        if (!texto) continue;

        const st = getComputedStyle(el);
        if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) < 0.5) continue;
        const frente = cor(st.color);
        if (!frente || frente.a < 0.5) continue;

        const atras = fundoDe(el);
        if (!atras) continue;
        const l1 = lum(frente.rgb);
        const l2 = lum(atras);
        const razao = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

        const px = parseFloat(st.fontSize);
        const grande = px >= 24 || (px >= 18.66 && Number(st.fontWeight) >= 700);
        if (razao >= (grande ? minGrande : minComum)) continue;

        achados.push({
          texto: texto.slice(0, 30),
          razao: Number(razao.toFixed(2)),
          cor: st.color,
          fundo: `rgb(${atras.join(',')})`,
          tamanho: px,
        });
      }

      // Uma linha por combinação de cores: a mesma falha repetida em vinte
      // células vira vinte linhas de relatório e esconde as outras.
      const vistos = new Set<string>();
      return achados
        .filter((a) => {
          const chave = a.cor + a.fundo;
          if (vistos.has(chave)) return false;
          vistos.add(chave);
          return true;
        })
        .sort((a, b) => a.razao - b.razao);
    },
    [MINIMO_COMUM, MINIMO_GRANDE],
  );
}

/** Escreve a preferência de tema antes de a página carregar. */
async function fixarTema(page: Page, tema: 'claro' | 'escuro') {
  await page.addInitScript((t) => {
    const chave = 'comercion.preferencias';
    const atual = JSON.parse(window.localStorage.getItem(chave) ?? '{}');
    window.localStorage.setItem(chave, JSON.stringify({ ...atual, tema: t }));
  }, tema);
}

const TELAS = ['/dashboard', '/products', '/customers', '/finance', '/settings'];

for (const tema of ['claro', 'escuro'] as const) {
  test(`o texto é legível no tema ${tema}`, async ({ paginaLogada: page }) => {
    await fixarTema(page, tema);

    const problemas: string[] = [];
    for (const tela of TELAS) {
      await page.goto(tela);
      await expect(page.locator('h1').first(), `${tela} não renderizou`).toBeVisible({ timeout: 15_000 });

      // Confere que o tema pedido é mesmo o que está na tela: sem isto, um
      // defeito na troca de tema faria os dois testes medirem a mesma coisa.
      const escuro = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      expect(escuro, `${tela} não está no tema ${tema}`).toBe(tema === 'escuro');

      for (const a of await medirContraste(page)) {
        problemas.push(`${tela} — "${a.texto}" ${a.razao}:1 (${a.cor} sobre ${a.fundo}, ${a.tamanho}px)`);
      }
    }

    expect(problemas, problemas.join(String.fromCharCode(10))).toEqual([]);
  });
}
