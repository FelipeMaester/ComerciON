/**
 * A cor da loja pintando o painel.
 *
 * A loja já escolhe uma cor principal em Configurações, mas até aqui ela só
 * valia para a loja virtual — quem trabalha no sistema o dia inteiro via um
 * painel cinza igual ao de todo mundo. Esta função escreve a cor escolhida nas
 * variáveis que o Tailwind lê (`--marca`), então botão, item de menu ativo,
 * foco e link passam a usar a identidade da loja sem recompilar nada.
 */

type Rgb = [number, number, number];

/** `#4f46e5` ou `#f0a` → `[79, 70, 229]`. Devolve null para qualquer outro formato. */
function paraRgb(hex: string): Rgb | null {
  const limpo = hex.trim().replace(/^#/, '');
  const completo = limpo.length === 3 ? limpo.replace(/(.)/g, '$1$1') : limpo;
  if (!/^[0-9a-fA-F]{6}$/.test(completo)) return null;
  const n = parseInt(completo, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminância relativa (WCAG) — a base de todo cálculo de contraste. */
function luminancia([r, g, b]: Rgb): number {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

const BRANCO = 1;
const QUASE_PRETO = luminancia([15, 23, 42]);
/** Mínimo da WCAG para texto normal. Abaixo disso, o rótulo do botão some. */
const CONTRASTE_MINIMO = 4.5;

function contraste(a: number, b: number): number {
  const [claro, escuro] = a > b ? [a, b] : [b, a];
  return (claro + 0.05) / (escuro + 0.05);
}

function escurecer(rgb: Rgb, fator: number): Rgb {
  return rgb.map((v) => Math.max(0, Math.round(v * fator))) as Rgb;
}

function clarear(rgb: Rgb, fator: number): Rgb {
  return rgb.map((v) => Math.min(255, Math.round(v + (255 - v) * fator))) as Rgb;
}

/**
 * Versão da cor que aguenta texto em cima.
 *
 * Vermelho puro (#ff0000) é o caso que obrigou isto a existir: é a cor da loja
 * demo, e tanto branco quanto preto por cima dão ~4:1 — abaixo do mínimo. Em
 * vez de escolher "o menos ruim" e entregar um botão que ninguém lê, escurece
 * a cor até o texto branco ficar legível. Cor que já passa não é tocada, então
 * a loja continua vendo exatamente a cor que escolheu.
 */
function corComTextoLegivel(rgb: Rgb): { fundo: Rgb; texto: Rgb } {
  const l = luminancia(rgb);
  const comBranco = contraste(l, BRANCO);
  const comPreto = contraste(l, QUASE_PRETO);

  if (comBranco >= CONTRASTE_MINIMO) return { fundo: rgb, texto: [255, 255, 255] };
  if (comPreto >= CONTRASTE_MINIMO) return { fundo: rgb, texto: [15, 23, 42] };

  let ajustada = rgb;
  for (let i = 0; i < 12 && contraste(luminancia(ajustada), BRANCO) < CONTRASTE_MINIMO; i++) {
    ajustada = escurecer(ajustada, 0.9);
  }
  return { fundo: ajustada, texto: [255, 255, 255] };
}

/**
 * Aplica a cor no documento. Cor ausente ou inválida não faz nada — o padrão
 * de fábrica declarado em `globals.css` continua valendo, e um valor
 * corrompido no banco não deixa o painel sem cor nenhuma.
 */
export function aplicarCorDaMarca(hex: string | null | undefined): void {
  if (typeof document === 'undefined' || !hex) return;
  const rgb = paraRgb(hex);
  if (!rgb) return;

  const { fundo, texto } = corComTextoLegivel(rgb);
  // O hover precisa ser visível nos dois temas: cor escura clareia, cor clara
  // escurece. Sem isso, escurecer um azul-marinho não muda nada na tela.
  const hover = luminancia(fundo) < 0.08 ? clarear(fundo, 0.25) : escurecer(fundo, 0.85);

  const raiz = document.documentElement;
  raiz.style.setProperty('--marca', rgb.join(' '));
  raiz.style.setProperty('--marca-solida', fundo.join(' '));
  raiz.style.setProperty('--marca-forte', hover.join(' '));
  raiz.style.setProperty('--marca-texto', texto.join(' '));
}

/** Iniciais para o quadradinho do menu quando a loja não tem logo. "Auto Peças Silva" → "AS". */
export function iniciaisDaLoja(nome: string | null | undefined): string {
  const palavras = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return '?';
  if (palavras.length === 1) return palavras[0].slice(0, 2).toUpperCase();
  return (palavras[0][0] + palavras[palavras.length - 1][0]).toUpperCase();
}
