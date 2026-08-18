'use client';

import { useState } from 'react';
import { caminhoSuave, escalaBonita, useTamanho, type Ponto } from './util';

export interface PontoSerie {
  /** Texto curto do eixo horizontal: "14/08". */
  rotulo: string;
  /** Texto longo do balão: "quinta, 14 de agosto". Cai no rótulo se ausente. */
  descricao?: string;
  valor: number;
  /** Linha secundária do balão: "3 vendas". */
  detalhe?: string;
}

interface Props {
  dados: PontoSerie[];
  /** Eixo vertical, onde não cabe valor por extenso: "R$ 3,4 mil". */
  formatar: (valor: number) => string;
  /**
   * Balão do hover. Cai no `formatar` se ausente, mas quase sempre vale passar
   * a versão por extenso: quem para o mouse num dia quer o valor exato, e o
   * abreviado do eixo transformaria R$ 3.847,50 em "R$ 3,8 mil" — jogando fora
   * justamente a precisão que a pessoa foi buscar.
   */
  formatarDetalhe?: (valor: number) => string;
  altura?: number;
  /** Linha horizontal de referência (meta, média). */
  referencia?: { valor: number; rotulo: string };
}

const ESQ = 56;
const DIR = 10;
const TOPO = 12;
const BASE = 22;

/**
 * Gráfico de área com linha suave.
 *
 * O balão e o cursor vertical são o motivo de o gráfico existir em vez de uma
 * tabela: trinta números numa tabela não mostram formato nenhum, e a tabela não
 * responde a "quanto foi no dia 12?" sem o olho percorrer trinta linhas.
 */
export function GraficoArea({ dados, formatar, formatarDetalhe, altura = 240, referencia }: Props) {
  const detalhar = formatarDetalhe ?? formatar;
  const { ref, largura } = useTamanho<HTMLDivElement>();
  const [ativo, setAtivo] = useState<number | null>(null);

  const larguraPlot = Math.max(0, largura - ESQ - DIR);
  const alturaPlot = altura - TOPO - BASE;

  const maximo = Math.max(...dados.map((d) => d.valor), referencia?.valor ?? 0);
  const { topo, marcas } = escalaBonita(maximo);

  const emY = (valor: number) => TOPO + alturaPlot - (valor / topo) * alturaPlot;
  const emX = (indice: number) =>
    dados.length <= 1 ? ESQ + larguraPlot / 2 : ESQ + (indice / (dados.length - 1)) * larguraPlot;

  const pontos: Ponto[] = dados.map((d, i) => ({ x: emX(i), y: emY(d.valor) }));
  const linha = caminhoSuave(pontos);
  const area = pontos.length > 0 ? `${linha} L ${pontos[pontos.length - 1].x} ${TOPO + alturaPlot} L ${pontos[0].x} ${TOPO + alturaPlot} Z` : '';

  // Um rótulo a cada N dias: trinta datas lado a lado viram uma tarja preta.
  const passoRotulo = Math.max(1, Math.ceil(dados.length / 6));

  function aoMover(evento: React.PointerEvent<SVGSVGElement>) {
    if (dados.length === 0 || larguraPlot <= 0) return;
    const caixa = evento.currentTarget.getBoundingClientRect();
    const x = evento.clientX - caixa.left;
    const proporcao = (x - ESQ) / larguraPlot;
    const indice = Math.round(proporcao * (dados.length - 1));
    setAtivo(Math.min(dados.length - 1, Math.max(0, indice)));
  }

  const ponto = ativo === null ? null : dados[ativo];

  return (
    <div ref={ref} className="relative w-full" style={{ height: altura }}>
      {largura > 0 && (
        <svg
          width={largura}
          height={altura}
          role="img"
          aria-label={`Gráfico de ${dados.length} pontos. Maior valor: ${formatar(maximo)}.`}
          onPointerMove={aoMover}
          onPointerLeave={() => setAtivo(null)}
          className="touch-none"
        >
          <defs>
            <linearGradient id="area-marca" x1="0" y1="0" x2="0" y2="1">
              {/* stop-color aceita var() porque é propriedade CSS — é isto que
                  faz o gráfico seguir a cor da loja e o tema sem JavaScript. */}
              <stop offset="0%" style={{ stopColor: 'rgb(var(--marca))', stopOpacity: 0.28 }} />
              <stop offset="100%" style={{ stopColor: 'rgb(var(--marca))', stopOpacity: 0 }} />
            </linearGradient>
          </defs>

          {/* Grade só na horizontal: a vertical viraria uma gaiola sobre a
              curva, e o eixo do tempo já é lido pelos rótulos de baixo. */}
          {marcas.map((marca) => (
            <g key={marca}>
              <line
                x1={ESQ}
                y1={emY(marca)}
                x2={largura - DIR}
                y2={emY(marca)}
                className="stroke-linha"
                strokeWidth={1}
                strokeDasharray={marca === 0 ? undefined : '3 4'}
              />
              <text x={ESQ - 8} y={emY(marca) + 3.5} textAnchor="end" className="fill-tenue text-[10px] tabular-nums">
                {formatar(marca)}
              </text>
            </g>
          ))}

          {referencia && referencia.valor > 0 && (
            <g>
              <line
                x1={ESQ}
                y1={emY(referencia.valor)}
                x2={largura - DIR}
                y2={emY(referencia.valor)}
                className="stroke-emerald-500"
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
              <text x={largura - DIR} y={emY(referencia.valor) - 5} textAnchor="end" className="fill-emerald-600 text-[10px] font-medium dark:fill-emerald-400">
                {referencia.rotulo}
              </text>
            </g>
          )}

          <path d={area} fill="url(#area-marca)" className="animate-aparecer" />
          <path
            // A chave reinicia o traço quando a série muda (troca de período).
            key={`linha-${dados.length}-${maximo}`}
            d={linha}
            fill="none"
            pathLength={1}
            strokeDasharray={1}
            style={{ ['--comprimento' as string]: 1 }}
            className="animate-desenhar stroke-marca"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {dados.map((d, i) =>
            i % passoRotulo === 0 || i === dados.length - 1 ? (
              <text key={`r-${i}`} x={emX(i)} y={altura - 6} textAnchor="middle" className="fill-tenue text-[10px]">
                {d.rotulo}
              </text>
            ) : null,
          )}

          {ativo !== null && (
            <g className="pointer-events-none">
              <line x1={emX(ativo)} y1={TOPO} x2={emX(ativo)} y2={TOPO + alturaPlot} className="stroke-marca/40" strokeWidth={1} />
              {/* Anel branco em volta do ponto: separa o marcador da própria
                  curva quando os dois se encostam. */}
              <circle cx={emX(ativo)} cy={emY(dados[ativo].valor)} r={5.5} className="fill-superficie stroke-marca" strokeWidth={2.5} />
            </g>
          )}
        </svg>
      )}

      {/* O balão é HTML, não SVG: texto em HTML quebra linha, herda a fonte do
          painel e não precisa de medida manual de largura. */}
      {ponto && ativo !== null && largura > 0 && (
        <div
          className="pointer-events-none absolute z-10 animate-balao rounded-lg border border-linha bg-superficie px-3 py-2 shadow-flutuante"
          style={{
            left: Math.min(Math.max(emX(ativo) - 70, 0), Math.max(0, largura - 150)),
            top: Math.max(0, emY(ponto.valor) - 62),
            minWidth: 140,
          }}
        >
          <div className="text-[11px] text-tenue">{ponto.descricao ?? ponto.rotulo}</div>
          <div className="text-sm font-semibold tabular-nums text-texto">{detalhar(ponto.valor)}</div>
          {ponto.detalhe && <div className="text-[11px] text-suave">{ponto.detalhe}</div>}
        </div>
      )}
    </div>
  );
}
