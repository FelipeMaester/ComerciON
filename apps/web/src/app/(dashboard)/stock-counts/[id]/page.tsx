'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoFicha } from '@/components/Carregando';
import { ErrorNotice } from '@/components/ErrorNotice';
import type { StockCount, StockCountStatus } from '@/lib/types';

const STATUS_LABEL: Record<StockCountStatus, string> = {
  OPEN: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELED: 'Cancelada',
};

export default function StockCountDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [count, setCount] = useState<StockCount | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await api.get<StockCount>(`/inventory/stock-counts/${params.id}`);
      setCount(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a contagem de estoque.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function saveCountedQty(itemId: string) {
    const value = drafts[itemId];
    if (value === undefined || value === '') return;
    setSavingItemId(itemId);
    setActionError(null);
    try {
      const updated = await api.patch<StockCount>(`/inventory/stock-counts/${params.id}/items/${itemId}`, {
        countedQty: Number(value),
      });
      setCount(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível salvar a quantidade contada.');
    } finally {
      setSavingItemId(null);
    }
  }

  async function complete() {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/inventory/stock-counts/${params.id}/complete`);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível concluir a contagem.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/inventory/stock-counts/${params.id}/cancel`);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível cancelar a contagem.');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorNotice message={error} />;
  if (!count) return <CarregandoFicha />;

  const pendingCount = count.items.filter((i) => i.countedQty === null).length;
  const divergentCount = count.items.filter((i) => i.countedQty !== null && i.countedQty !== i.expectedQty).length;

  return (
    <div>
      <button
        onClick={() => router.push('/stock-counts')}
        className="mb-4 text-sm text-suave hover:text-texto"
      >
        ← Voltar
      </button>

      <div className="card mb-6 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="titulo-pagina">{count.warehouse.name}</h1>
          <span className="text-sm font-medium">{STATUS_LABEL[count.status]}</span>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm text-suave sm:grid-cols-4">
          <div>
            <dt className="text-tenue">Aberta em</dt>
            <dd>{new Date(count.createdAt).toLocaleString('pt-BR')}</dd>
          </div>
          <div>
            <dt className="text-tenue">Itens</dt>
            <dd>{count.items.length}</dd>
          </div>
          <div>
            <dt className="text-tenue">Ainda não contados</dt>
            <dd>{pendingCount}</dd>
          </div>
          <div>
            <dt className="text-tenue">Com divergência</dt>
            <dd className={divergentCount > 0 ? 'font-medium text-amber-700 dark:text-amber-400' : ''}>{divergentCount}</dd>
          </div>
        </dl>

        {count.notes && (
          <p className="mt-3 text-sm text-suave">
            <span className="text-tenue">Observações: </span>
            {count.notes}
          </p>
        )}

        {count.status === 'OPEN' && (
          <div className="mt-4 flex gap-2 border-t border-linha pt-4">
            <button onClick={complete} disabled={busy} className="btn-primary">
              {busy ? 'Concluindo…' : 'Concluir contagem'}
            </button>
            <button
              onClick={cancel}
              disabled={busy}
              className="rounded-lg border border-red-300 dark:border-red-800 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
            >
              Cancelar contagem
            </button>
          </div>
        )}

        {count.status === 'COMPLETED' && (
          <p className="mt-4 border-t border-linha pt-3 text-sm text-emerald-700 dark:text-emerald-400">
            Divergências ajustadas no estoque em {count.completedAt && new Date(count.completedAt).toLocaleString('pt-BR')}.
          </p>
        )}

        {actionError && (
          <div className="mt-3">
            <ErrorNotice message={actionError} />
          </div>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <table className="tabela card">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Sistema</th>
              <th>Contado</th>
              <th>Diferença</th>
              {count.status === 'OPEN' && <th></th>}
            </tr>
          </thead>
          <tbody>
            {count.items.map((item) => {
              const draftValue = drafts[item.id] ?? (item.countedQty === null ? '' : String(item.countedQty));
              const diff = item.countedQty === null ? null : item.countedQty - item.expectedQty;
              return (
                <tr key={item.id}>
                  <td>
                    {item.product.name} <span className="text-tenue">· {item.product.sku}</span>
                  </td>
                  <td>{item.expectedQty}</td>
                  <td>
                    {count.status === 'OPEN' ? (
                      <input
                        className="input w-24"
                        type="number"
                        step={1}
                        min={0}
                        value={draftValue}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                      />
                    ) : (
                      (item.countedQty ?? '—')
                    )}
                  </td>
                  <td
                    className={`px-4 py-2 ${diff && diff !== 0 ? 'font-medium text-amber-700 dark:text-amber-400' : ''}`}
                  >
                    {diff === null ? '—' : diff > 0 ? `+${diff}` : diff}
                  </td>
                  {count.status === 'OPEN' && (
                    <td>
                      <button
                        onClick={() => saveCountedQty(item.id)}
                        disabled={savingItemId === item.id || draftValue === ''}
                        className="btn-secondary text-xs disabled:opacity-50"
                      >
                        {savingItemId === item.id ? 'Salvando…' : 'Salvar'}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
