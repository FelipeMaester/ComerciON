'use client';

import { useEffect, useRef, useState } from 'react';
import type { Coluna, Ordenacao } from '@/lib/tabela';

/**
 * Cabeçalho que ordena ao clique.
 *
 * É um `<button>` dentro do `<th>`, e não um `<th onClick>`: cabeçalho
 * clicável sem botão não recebe foco pelo teclado e não se anuncia como
 * acionável para leitor de tela — a pessoa que navega por Tab simplesmente não
 * alcançaria a ordenação.
 *
 * `aria-sort` é o que faz o leitor de tela dizer "ordenado por preço,
 * crescente" em vez de ler uma seta solta.
 */
export function CabecalhoOrdenavel<T>({
  coluna,
  ordenacao,
  aoOrdenar,
}: {
  coluna: Coluna<T>;
  ordenacao: Ordenacao | null;
  aoOrdenar: (chave: string) => void;
}) {
  const ativa = ordenacao?.coluna === coluna.chave;
  const direcao = ativa ? ordenacao.direcao : null;

  return (
    <th
      className={coluna.numerica ? 'num' : undefined}
      aria-sort={ativa ? (direcao === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => aoOrdenar(coluna.chave)}
        className={`group inline-flex items-center gap-1 transition-colors hover:text-texto ${
          ativa ? 'text-texto' : ''
        } ${coluna.numerica ? 'flex-row-reverse' : ''}`}
        title={`Ordenar por ${coluna.titulo}`}
      >
        {coluna.titulo}
        {/* A seta só fica sólida na coluna ativa; nas outras aparece fraca no
            hover, que é o que ensina que dá para clicar. */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden
          className={`h-3 w-3 shrink-0 transition-opacity ${
            ativa ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'
          }`}
        >
          {direcao === 'desc' ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 15l-6-6-6 6" />
          )}
        </svg>
      </button>
    </th>
  );
}

/**
 * Escolha de quais colunas aparecem.
 *
 * Existe porque a mesma tela serve gente diferente: quem compra quer ver
 * custo e mínimo; quem atende no balcão quer nome, preço e o que tem em
 * estoque, e as outras colunas só empurram o que importa para fora da tela do
 * notebook.
 */
/**
 * Diz, quando é o caso, que esta coluna é ordenada só na página carregada.
 *
 * Sem este aviso a tela mente sem parecer: numa lista de 800 peças paginada de
 * 25 em 25, clicar em uma coluna e ver o maior valor no topo dá a entender que
 * aquele é o maior da loja — e não é, é o maior das 25 que estavam carregadas.
 * Medido: com 30 peças, a tela apontava a de R$ 250 como a mais cara, quando
 * existia uma de R$ 300 na página seguinte.
 *
 * A maioria das colunas hoje é ordenada no banco e não cai mais nisso; o aviso
 * ficou para as que o banco não sabe ordenar — saldo de estoque, contagem de
 * itens — que são calculadas depois da consulta.
 */
export function AvisoDeOrdenacaoPorPagina({
  ordenando,
  naTela,
  total,
}: {
  ordenando: boolean;
  naTela: number;
  total?: number;
}) {
  if (!ordenando || !total || total <= naTela) return null;

  return (
    <p className="mb-2 text-xs text-tenue">
      Esta coluna é ordenada só nas {naTela} linhas desta página, não nas {total} da lista — o valor é calculado
      depois da consulta, então o banco não sabe ordenar por ele. O botão CSV baixa a lista inteira.
    </p>
  );
}

export function SeletorDeColunas<T>({
  colunas,
  escondidas,
  aoAlternar,
  aoRestaurar,
}: {
  colunas: Coluna<T>[];
  escondidas: string[];
  aoAlternar: (chave: string) => void;
  aoRestaurar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    function aoClicarFora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    window.addEventListener('keydown', aoTeclar);
    document.addEventListener('mousedown', aoClicarFora);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('mousedown', aoClicarFora);
    };
  }, [aberto]);

  const ocultas = escondidas.length;

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="btn-secondary btn-sm inline-flex items-center gap-1.5"
        title="Escolher colunas"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6h16.5M3.75 12h16.5M3.75 18h16.5" />
        </svg>
        Colunas
        {ocultas > 0 && <span className="text-xs text-tenue">({ocultas} oculta{ocultas > 1 ? 's' : ''})</span>}
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-linha bg-superficie py-1 shadow-flutuante">
          {colunas.map((coluna) => {
            const visivel = coluna.fixa || !escondidas.includes(coluna.chave);
            return (
              <label
                key={coluna.chave}
                className={`flex items-center gap-2.5 px-3 py-1.5 text-sm ${
                  coluna.fixa ? 'cursor-default text-tenue' : 'cursor-pointer text-texto hover:bg-realce'
                }`}
                title={coluna.fixa ? 'Esta coluna identifica a linha e não pode ser escondida' : undefined}
              >
                <input
                  type="checkbox"
                  checked={visivel}
                  disabled={coluna.fixa}
                  onChange={() => aoAlternar(coluna.chave)}
                />
                {coluna.titulo}
              </label>
            );
          })}
          {ocultas > 0 && (
            <button
              type="button"
              onClick={() => {
                aoRestaurar();
                setAberto(false);
              }}
              className="mt-1 w-full border-t border-linha px-3 py-2 text-left text-xs text-suave hover:bg-realce"
            >
              Mostrar todas
            </button>
          )}
        </div>
      )}
    </div>
  );
}
