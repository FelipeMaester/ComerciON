'use client';

import { baixarCsv } from '@/lib/csv';
import type { Coluna } from '@/lib/tabela';

/**
 * Baixa a lista que está na tela.
 *
 * Fica desabilitado com a lista vazia em vez de sumir: um botão que aparece e
 * desaparece conforme o filtro faz a pessoa procurar onde ele foi parar. O
 * `title` explica o porquê quando está desabilitado.
 */
export function BotaoCsv<T>({
  nomeBase,
  colunas,
  itens,
}: {
  nomeBase: string;
  colunas: Coluna<T>[];
  itens: T[];
}) {
  const vazio = itens.length === 0;

  return (
    <button
      type="button"
      onClick={() => baixarCsv(nomeBase, colunas, itens)}
      disabled={vazio}
      className="btn-secondary btn-sm inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
      title={vazio ? 'Nada para exportar nesta lista' : 'Baixar em CSV o que está na tela'}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
      </svg>
      CSV
    </button>
  );
}
