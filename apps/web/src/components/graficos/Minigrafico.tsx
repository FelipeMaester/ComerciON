'use client';

import { caminhoSuave, type Ponto } from './util';

interface Props {
  valores: number[];
  /** Verde/vermelho conforme a tendência, em vez da cor da marca. */
  tom?: 'marca' | 'alta' | 'baixa';
  largura?: number;
  altura?: number;
}

/**
 * Linha minúscula dentro do cartão de indicador.
 *
 * Não tem eixo, número nem balão — de propósito. Serve para uma pergunta só:
 * "está subindo ou descendo?". O valor exato já está em corpo 28 logo ao lado,
 * e qualquer coisa a mais aqui competiria com ele.
 *
 * Tamanho fixo, sem medir o container: é um enfeite de 96 pixels dentro de um
 * cartão, e um ResizeObserver por indicador seria caro à toa numa fileira de
 * quatro.
 */
export function Minigrafico({ valores, tom = 'marca', largura = 96, altura = 32 }: Props) {
  if (valores.length < 2) return null;

  const maximo = Math.max(...valores);
  const minimo = Math.min(...valores);
  const amplitude = maximo - minimo;

  const pontos: Ponto[] = valores.map((valor, i) => ({
    x: (i / (valores.length - 1)) * (largura - 2) + 1,
    // Série constante (tudo zero, loja parada) desenharia em cima da borda:
    // sem amplitude, a linha vai para o meio da caixa.
    y: amplitude === 0 ? altura / 2 : altura - 3 - ((valor - minimo) / amplitude) * (altura - 6),
  }));

  const linha = caminhoSuave(pontos);
  const area = `${linha} L ${pontos[pontos.length - 1].x} ${altura} L ${pontos[0].x} ${altura} Z`;

  const classe =
    tom === 'alta' ? 'stroke-emerald-500' : tom === 'baixa' ? 'stroke-red-500' : 'stroke-marca';
  const preenchimento =
    tom === 'alta'
      ? 'rgb(16 185 129 / 0.14)'
      : tom === 'baixa'
        ? 'rgb(239 68 68 / 0.14)'
        : 'rgb(var(--marca) / 0.14)';

  return (
    <svg width={largura} height={altura} aria-hidden className="overflow-visible">
      <path d={area} fill={preenchimento} />
      <path d={linha} fill="none" className={classe} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
