'use client';

import type { Paginated } from '@/lib/types';

/**
 * Controle de página das listagens.
 *
 * Some quando só há uma página — numa loja pequena, a maioria das telas cabe
 * numa só, e um "1 de 1" com setas desabilitadas é ruído.
 */
export function Pagination({
  data,
  onPageChange,
  itemLabel = 'itens',
}: {
  data: Pick<Paginated<unknown>, 'page' | 'total' | 'totalPages'> | null;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}) {
  if (!data || data.totalPages <= 1) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-suave">
        {data.total} {itemLabel} · página {data.page} de {data.totalPages}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(data.page - 1)}
          disabled={data.page <= 1}
          className="btn-secondary btn-sm disabled:opacity-40"
        >
          Anterior
        </button>
        <button
          onClick={() => onPageChange(data.page + 1)}
          disabled={data.page >= data.totalPages}
          className="btn-secondary btn-sm disabled:opacity-40"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
