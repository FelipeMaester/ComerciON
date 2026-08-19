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

/** Fundo das superfícies em cada tema — de onde saem as duas versões legíveis. */
const SUPERFICIE_CLARA = luminancia([255, 255, 255]);
const SUPERFICIE_ESCURA = luminancia([15, 23, 42]);

/**
 * A cor da marca servindo como COR DE TEXTO sobre a superfície do painel —
 * link, item ativo do menu, etiqueta.
 *
 * Precisa de duas versões, e não de uma. Para passar de 4,5:1 sobre branco a
 * cor tem de ser escura; para passar sobre o fundo escuro, tem de ser clara.
 * As duas exigências não se encontram: nenhum valor único satisfaz as duas, e
 * era por isso que `text-marca` reprovava em contraste — vermelho puro dá 4,0:1
 * sobre branco. Aqui saem as duas, e o CSS escolhe conforme o tema.
 */
function versoesLegiveis(rgb: Rgb): { claro: Rgb; escuro: Rgb } {
  let claro = rgb;
  for (let i = 0; i < 20 && contraste(luminancia(claro), SUPERFICIE_CLARA) < CONTRASTE_MINIMO; i++) {
    claro = escurecer(claro, 0.88);
  }

  let escuro = rgb;
  for (let i = 0; i < 20 && contraste(luminancia(escuro), SUPERFICIE_ESCURA) < CONTRASTE_MINIMO; i++) {
    escuro = clarear(escuro, 0.16);
  }

  return { claro, escuro };
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
  const legivel = versoesLegiveis(rgb);

  const raiz = document.documentElement;
  raiz.style.setProperty('--marca', rgb.join(' '));
  raiz.style.setProperty('--marca-solida', fundo.join(' '));
  raiz.style.setProperty('--marca-forte', hover.join(' '));
  raiz.style.setProperty('--marca-texto', texto.join(' '));
  // As duas versões viajam juntas; quem decide qual vale é a regra de tema em
  // globals.css. O estilo em linha ganharia de qualquer seletor, então não dá
  // para resolver isso aqui.
  raiz.style.setProperty('--marca-legivel-claro', legivel.claro.join(' '));
  raiz.style.setProperty('--marca-legivel-escuro', legivel.escuro.join(' '));
}

/**
 * Leitura de contraste para a tela de Configurações mostrar antes de salvar.
 *
 * Devolve o que a cor crua faz sobre cada superfície e se o painel precisou
 * ajustá-la — para a loja saber que a cor escolhida vale, sem precisar
 * confiar na palavra do sistema.
 */
/**
 * As variáveis que a prévia de cor em Configurações usa.
 *
 * A prévia promete mostrar como a cor fica no menu. Se ela pintar a cor crua
 * enquanto o menu pinta a versão legível, o lojista escolhe uma cor olhando
 * para algo que a tela real não vai mostrar — e no tema escuro a diferença é
 * entre ler e não ler. Devolve as duas versões; qual vale é o CSS que decide,
 * conforme o tema, do mesmo jeito que acontece com a cor de verdade.
 */
export function variaveisDePrevia(hex: string): Record<string, string> | null {
  const rgb = paraRgb(hex);
  if (!rgb) return null;
  const legivel = versoesLegiveis(rgb);
  return {
    "--previa": rgb.join(" "),
    "--previa-legivel-claro": legivel.claro.join(" "),
    "--previa-legivel-escuro": legivel.escuro.join(" "),
  };
}

export function diagnosticoDaCor(hex: string): {
  valida: boolean;
  contrasteNoBotao: number;
  ajustada: boolean;
  contrasteComoTextoClaro: number;
  contrasteComoTextoEscuro: number;
} | null {
  const rgb = paraRgb(hex);
  if (!rgb) return null;

  const { fundo, texto } = corComTextoLegivel(rgb);
  const arredonda = (n: number) => Math.round(n * 100) / 100;

  return {
    valida: true,
    contrasteNoBotao: arredonda(contraste(luminancia(fundo), luminancia(texto))),
    // "Ajustada" = a cor do botão não é exatamente a escolhida, porque a
    // escolhida não aguentava texto em cima.
    ajustada: fundo.join(',') !== rgb.join(','),
    contrasteComoTextoClaro: arredonda(contraste(luminancia(rgb), SUPERFICIE_CLARA)),
    contrasteComoTextoEscuro: arredonda(contraste(luminancia(rgb), SUPERFICIE_ESCURA)),
  };
}

/** Cores prontas, todas conferidas nos dois temas. */
export const CORES_SUGERIDAS: { hex: string; nome: string }[] = [
  { hex: '#4f46e5', nome: 'Índigo' },
  { hex: '#0f766e', nome: 'Petróleo' },
  { hex: '#b91c1c', nome: 'Vermelho' },
  { hex: '#c2410c', nome: 'Laranja' },
  { hex: '#a16207', nome: 'Mostarda' },
  { hex: '#15803d', nome: 'Verde' },
  { hex: '#0369a1', nome: 'Azul' },
  { hex: '#7e22ce', nome: 'Roxo' },
  { hex: '#be185d', nome: 'Magenta' },
  { hex: '#334155', nome: 'Grafite' },
];

/** Iniciais para o quadradinho do menu quando a loja não tem logo. "Auto Peças Silva" → "AS". */
export function iniciaisDaLoja(nome: string | null | undefined): string {
  const palavras = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return '?';
  if (palavras.length === 1) return palavras[0].slice(0, 2).toUpperCase();
  return (palavras[0][0] + palavras[palavras.length - 1][0]).toUpperCase();
}
