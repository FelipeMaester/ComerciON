'use client';

import { useState } from 'react';

export interface BarraItem {
  id: string;
  rotulo: string;
  valor: number;
  detalhe?: string;
}

interface Props {
  dados: BarraItem[];
  formatar: (valor: number) => string;
  /** Cor fixa em vez da marca — usado quando as barras já têm cor própria. */
  cor?: (indice: number) => string;
}

/**
 * Barras horizontais para ranking (mais vendidos, maiores clientes).
 *
 * Horizontais de propósito: nome de produto é longo ("Radiador Gol G5/G6
 * 1.0/1.6") e em barra vertical o rótulo teria de ficar deitado ou cortado.
 *
 * É HTML com div, não SVG: barra é um retângulo com largura em porcentagem, e
 * em HTML ela ganha de graça o texto que quebra linha, o `title` do navegador
 * e a transição de largura.
 */
export function GraficoBarras({ dados, formatar, cor }: Props) {
  const [ativo, setAtivo] = useState<string | null>(null);
  const maximo = Math.max(...dados.map((d) => d.valor), 0);

  return (
    <ul className="space-y-2.5">
      {dados.map((item, i) => {
        const proporcao = maximo > 0 ? (item.valor / maximo) * 100 : 0;
        const destacado = ativo === item.id;

        return (
          <li
            key={item.id}
            onPointerEnter={() => setAtivo(item.id)}
            onPointerLeave={() => setAtivo(null)}
            className="group"
          >
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-texto" title={item.rotulo}>
                {item.rotulo}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-texto">{formatar(item.valor)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-realce">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-saida"
                  style={{
                    width: `${proporcao}%`,
                    background: cor ? cor(i) : 'linear-gradient(90deg, rgb(var(--marca)), rgb(var(--marca-forte)))',
                    // Realce sutil: o item sob o mouse ganha corpo, os outros
                    // recuam. Sem isto, uma lista de cinco barras é estática.
                    opacity: ativo === null || destacado ? 1 : 0.55,
                  }}
                />
              </div>
              {item.detalhe && <span className="w-16 shrink-0 text-right text-xs tabular-nums text-tenue">{item.detalhe}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
