'use client';

import { useState } from 'react';
import { corDaSerie } from './util';

export interface FatiaItem {
  id: string;
  rotulo: string;
  valor: number;
}

interface Props {
  dados: FatiaItem[];
  formatar: (valor: number) => string;
  /** Texto do miolo quando nada está sob o mouse. */
  legendaCentro?: string;
  tamanho?: number;
}

const RAIO = 54;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

/**
 * Rosca de composição (formas de pagamento, origem das vendas).
 *
 * O miolo não fica vazio: em repouso mostra o total, e sob o mouse troca para a
 * fatia apontada. É o que dispensa o balão flutuante — a informação aparece
 * sempre no mesmo lugar, em vez de perseguir o cursor.
 *
 * As fatias são traços de um mesmo círculo, controlados por `stroke-dasharray`.
 * Sai mais simples que montar cada arco com trigonometria, e a espessura anima
 * sozinha no hover.
 */
export function GraficoRosca({ dados, formatar, legendaCentro = 'Total', tamanho = 150 }: Props) {
  const [ativo, setAtivo] = useState<string | null>(null);

  const total = dados.reduce((soma, d) => soma + d.valor, 0);
  const emFoco = dados.find((d) => d.id === ativo);

  let acumulado = 0;
  const fatias = dados.map((item, i) => {
    const proporcao = total > 0 ? item.valor / total : 0;
    const fatia = { item, cor: corDaSerie(i), proporcao, inicio: acumulado };
    acumulado += proporcao;
    return fatia;
  });

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
        <svg viewBox="0 0 140 140" width={tamanho} height={tamanho} className="-rotate-90">
          <circle cx="70" cy="70" r={RAIO} fill="none" className="stroke-realce" strokeWidth={16} />
          {total > 0 &&
            fatias.map(({ item, cor, proporcao, inicio }) => (
              <circle
                key={item.id}
                cx="70"
                cy="70"
                r={RAIO}
                fill="none"
                stroke={cor}
                // Um fio de folga entre as fatias, para elas não se fundirem
                // num anel só quando as cores são próximas.
                strokeDasharray={`${Math.max(0, proporcao * CIRCUNFERENCIA - 2)} ${CIRCUNFERENCIA}`}
                strokeDashoffset={-inicio * CIRCUNFERENCIA}
                strokeWidth={ativo === item.id ? 20 : 16}
                strokeLinecap="butt"
                onPointerEnter={() => setAtivo(item.id)}
                onPointerLeave={() => setAtivo(null)}
                className="cursor-default transition-all duration-200 ease-saida"
                style={{ opacity: ativo === null || ativo === item.id ? 1 : 0.4 }}
              />
            ))}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="max-w-[86px] truncate text-[11px] text-tenue">{emFoco ? emFoco.rotulo : legendaCentro}</span>
          <span className="text-sm font-semibold tabular-nums text-texto">
            {formatar(emFoco ? emFoco.valor : total)}
          </span>
          {emFoco && total > 0 && (
            <span className="text-[11px] tabular-nums text-suave">{((emFoco.valor / total) * 100).toFixed(0)}%</span>
          )}
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {fatias.map(({ item, cor, proporcao }) => (
          <li
            key={item.id}
            onPointerEnter={() => setAtivo(item.id)}
            onPointerLeave={() => setAtivo(null)}
            className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors ${
              ativo === item.id ? 'bg-realce' : ''
            }`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor }} />
            <span className="min-w-0 flex-1 truncate text-suave">{item.rotulo}</span>
            <span className="shrink-0 tabular-nums text-texto">{formatar(item.valor)}</span>
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-tenue">
              {(proporcao * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
