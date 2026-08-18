'use client';

import { useState } from 'react';
import { baixarCsv } from '@/lib/csv';
import type { Coluna } from '@/lib/tabela';

/**
 * Baixa a lista em CSV.
 *
 * Quando a lista é paginada, baixa a LISTA INTEIRA, não a página.
 *
 * A primeira versão exportava só o que estava na tela, e o rótulo dizia
 * exatamente isso. Só que "o que está na tela" são 25 linhas de um catálogo de
 * 800: medido, uma lista de 30 peças gerava um arquivo com 25 e nada avisava.
 * Quem exporta a lista de peças para mandar ao fornecedor não confere a
 * contagem — descobre depois, pelo pedido errado.
 *
 * Os filtros continuam valendo (é a lista que a pessoa montou), assim como as
 * colunas escolhidas e a ordem. O que deixa de valer é o corte da paginação,
 * que nunca foi uma escolha de ninguém: é um detalhe de como a tela carrega.
 */
export function BotaoCsv<T>({
  nomeBase,
  colunas,
  itens,
  total,
  carregarTudo,
  ordenar,
}: {
  nomeBase: string;
  colunas: Coluna<T>[];
  /** O que está na tela — usado quando a lista cabe numa página só. */
  itens: T[];
  /** Total de itens da lista filtrada, quando a tela sabe. */
  total?: number;
  /** Busca todas as páginas. Sem isto, exporta o que está na tela. */
  carregarTudo?: () => Promise<T[]>;
  /** Aplica a mesma ordenação da tela ao conjunto completo. */
  ordenar?: (itens: T[]) => T[];
}) {
  const [baixando, setBaixando] = useState(false);

  const quantidade = total ?? itens.length;
  const vazio = quantidade === 0;
  const temMaisQueATela = quantidade > itens.length;

  async function baixar() {
    setBaixando(true);
    try {
      const completos = temMaisQueATela && carregarTudo ? await carregarTudo() : itens;
      baixarCsv(nomeBase, colunas, ordenar ? ordenar(completos) : completos);
    } catch {
      // Falhou buscar o resto? Melhor exportar o que está na tela do que não
      // exportar nada — mas com o nome dizendo que é parcial, para o arquivo
      // não se passar por completo.
      baixarCsv(`${nomeBase}-parcial`, colunas, itens);
    } finally {
      setBaixando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={baixar}
      disabled={vazio || baixando}
      className="btn-secondary btn-sm inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
      title={
        vazio
          ? 'Nada para exportar nesta lista'
          : temMaisQueATela
            ? `Baixar as ${quantidade} linhas da lista, e não só as ${itens.length} desta página`
            : 'Baixar esta lista em CSV'
      }
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className="h-4 w-4">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
        />
      </svg>
      {baixando ? 'Baixando…' : 'CSV'}
      {/* O número no botão é o que evita a surpresa: quem vê "CSV 800" sabe o
          que vai receber antes de clicar. */}
      {!vazio && temMaisQueATela && <span className="text-xs text-tenue">{quantidade}</span>}
    </button>
  );
}
