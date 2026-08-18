'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Peças comuns dos gráficos: medida do container, escala e curva.
 *
 * POR QUE SVG À MÃO, E NÃO UMA BIBLIOTECA
 * A cor da marca é uma variável CSS trocada em tempo de execução (a loja
 * escolhe a cor em Configurações), e o tema claro/escuro redefine as mesmas
 * variáveis. Um `<path className="stroke-marca">` acompanha as duas coisas
 * sozinho, porque quem resolve `var()` é o CSS. Uma biblioteca de gráfico
 * recebe cor como string em JavaScript — seria preciso ler a variável
 * computada, observar a troca de tema e repassar tudo na mão. Fora que o
 * pacote Windows carrega o node_modules inteiro, e este arquivo pesa poucos
 * kilobytes contra as centenas de uma dependência.
 */

/**
 * Largura e altura reais do elemento, em pixels.
 *
 * Medir em vez de usar `viewBox` com escala: o viewBox esticado deforma texto
 * e espessura de traço quando a proporção muda — legenda achatada num monitor
 * largo. Com a medida real, cada pixel do SVG é um pixel da tela.
 */
export function useTamanho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;

    // Só troca o estado quando a medida muda de verdade. O ResizeObserver
    // dispara a cada quadro em alguns layouts, e um objeto novo a cada vez
    // faria o gráfico se redesenhar sessenta vezes por segundo parado.
    const medir = (largura: number, altura: number) => {
      setTamanho((atual) =>
        atual.largura === largura && atual.altura === altura ? atual : { largura, altura },
      );
    };

    // Medida imediata, antes de qualquer observador. O ResizeObserver é
    // entregue junto com o desenho do quadro: numa aba em segundo plano, ou
    // num navegador que não está compondo quadros, ele pode demorar — ou nunca
    // chegar — e o gráfico ficaria numa caixa vazia esperando. Medido: com
    // apenas o observador, o gráfico não aparecia. O `getBoundingClientRect`
    // responde na hora, e o observador fica só para os redimensionamentos.
    const caixa = elemento.getBoundingClientRect();
    medir(Math.round(caixa.width), Math.round(caixa.height));

    const observador = new ResizeObserver(([entrada]) => {
      const { width, height } = entrada.contentRect;
      medir(Math.round(width), Math.round(height));
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  return { ref, ...tamanho };
}

/**
 * Marcas do eixo vertical em números redondos.
 *
 * Um eixo que vai até 11.160,41 não ajuda ninguém: o olho lê "11 mil". Isto
 * arredonda o topo para 1, 2, 2,5 ou 5 vezes uma potência de dez, que são os
 * passos que a régua mental das pessoas usa.
 */
export function escalaBonita(maximo: number, divisoes = 4): { topo: number; marcas: number[] } {
  if (!Number.isFinite(maximo) || maximo <= 0) {
    return { topo: 1, marcas: [0, 1] };
  }

  const passoBruto = maximo / divisoes;
  const magnitude = Math.pow(10, Math.floor(Math.log10(passoBruto)));
  const normalizado = passoBruto / magnitude;
  const multiplicador = normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 2.5 ? 2.5 : normalizado <= 5 ? 5 : 10;
  const passo = multiplicador * magnitude;

  const topo = Math.ceil(maximo / passo) * passo;
  const marcas: number[] = [];
  for (let v = 0; v <= topo + passo / 2; v += passo) marcas.push(Math.round(v * 100) / 100);
  return { topo, marcas };
}

export interface Ponto {
  x: number;
  y: number;
}

/**
 * Curva suave que passa por todos os pontos sem inventar valores.
 *
 * É a interpolação cúbica monotônica de Fritsch–Carlson. A spline ingênua
 * (média das inclinações vizinhas) faz a curva ultrapassar os pontos: entre um
 * dia de R$ 0 e outro de R$ 3.000, ela desce abaixo de zero antes de subir — o
 * gráfico mostraria faturamento negativo num sistema onde isso não existe.
 * Limitar a inclinação a três vezes a menor variação vizinha impede o
 * ultrapasse, mantendo a curva macia.
 */
export function caminhoSuave(pontos: Ponto[]): string {
  if (pontos.length === 0) return '';
  if (pontos.length === 1) return `M ${pontos[0].x} ${pontos[0].y}`;
  if (pontos.length === 2) return `M ${pontos[0].x} ${pontos[0].y} L ${pontos[1].x} ${pontos[1].y}`;

  const n = pontos.length;
  const variacoes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pontos[i + 1].x - pontos[i].x;
    variacoes.push(dx === 0 ? 0 : (pontos[i + 1].y - pontos[i].y) / dx);
  }

  const inclinacoes: number[] = new Array(n);
  inclinacoes[0] = variacoes[0];
  inclinacoes[n - 1] = variacoes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const anterior = variacoes[i - 1];
    const proxima = variacoes[i];
    // Mudou de direção (pico ou vale)? Inclinação zero — é o que segura a
    // curva no ponto em vez de deixá-la disparar para além dele.
    if (anterior * proxima <= 0) {
      inclinacoes[i] = 0;
      continue;
    }
    const media = (anterior + proxima) / 2;
    const limite = 3 * Math.min(Math.abs(anterior), Math.abs(proxima));
    inclinacoes[i] = Math.sign(media) * Math.min(Math.abs(media), limite);
  }

  let d = `M ${pontos[0].x} ${pontos[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = pontos[i + 1].x - pontos[i].x;
    const c1x = pontos[i].x + dx / 3;
    const c1y = pontos[i].y + (inclinacoes[i] * dx) / 3;
    const c2x = pontos[i + 1].x - dx / 3;
    const c2y = pontos[i + 1].y - (inclinacoes[i + 1] * dx) / 3;
    d += ` C ${arred(c1x)} ${arred(c1y)}, ${arred(c2x)} ${arred(c2y)}, ${arred(pontos[i + 1].x)} ${arred(pontos[i + 1].y)}`;
  }
  return d;
}

function arred(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Cores das fatias/séries categóricas — as mesmas cinco declaradas no CSS. */
export const CORES_GRAFICO = [
  'rgb(var(--grafico-1))',
  'rgb(var(--grafico-2))',
  'rgb(var(--grafico-3))',
  'rgb(var(--grafico-4))',
  'rgb(var(--grafico-5))',
];

export function corDaSerie(indice: number): string {
  return CORES_GRAFICO[indice % CORES_GRAFICO.length];
}
