'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoFicha } from '@/components/Carregando';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Pagination } from '@/components/Pagination';
import { formatarNumero } from '@/lib/format';
import type { Paginated, ResumoDaContagem, StockCount, StockCountItem, StockCountStatus } from '@/lib/types';

const STATUS_LABEL: Record<StockCountStatus, string> = {
  OPEN: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELED: 'Cancelada',
};

type Situacao = 'TODOS' | 'PENDENTES' | 'DIVERGENTES';

const FILTROS: { valor: Situacao; rotulo: string }[] = [
  { valor: 'PENDENTES', rotulo: 'Ainda não contadas' },
  { valor: 'DIVERGENTES', rotulo: 'Com divergência' },
  { valor: 'TODOS', rotulo: 'Todas' },
];

export default function StockCountDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [count, setCount] = useState<StockCount | null>(null);
  const [pagina, setPagina] = useState<Paginated<StockCountItem> | null>(null);
  const [itens, setItens] = useState<StockCountItem[]>([]);
  // "Ainda não contadas" é o padrão: quem abre a contagem quer ver o que falta,
  // não recomeçar do começo da lista a cada peça.
  const [situacao, setSituacao] = useState<Situacao>('PENDENTES');
  const [busca, setBusca] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [carregandoItens, setCarregandoItens] = useState(true);
  const [busy, setBusy] = useState(false);

  const carregarFicha = useCallback(async () => {
    try {
      setCount(await api.get<StockCount>(`/inventory/stock-counts/${params.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a contagem de estoque.');
    }
  }, [params.id]);

  const carregarItens = useCallback(
    async (page = 1) => {
      setCarregandoItens(true);
      try {
        const query = new URLSearchParams({ page: String(page), situacao });
        if (busca.trim()) query.set('search', busca.trim());
        const dados = await api.get<Paginated<StockCountItem>>(
          `/inventory/stock-counts/${params.id}/items?${query.toString()}`,
        );
        setItens(dados.items);
        setPagina(dados);
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : 'Não foi possível carregar as peças da contagem.');
      } finally {
        setCarregandoItens(false);
      }
    },
    [params.id, situacao, busca],
  );

  useEffect(() => {
    carregarFicha();
  }, [carregarFicha]);

  // A busca espera a digitação parar — e o leitor de código de barras "digita"
  // o código inteiro de uma vez, então 250ms depois a peça já está na tela.
  useEffect(() => {
    const timer = setTimeout(() => carregarItens(1), 250);
    return () => clearTimeout(timer);
  }, [carregarItens]);

  async function salvar(itemId: string) {
    const valor = drafts[itemId];
    if (valor === undefined || valor === '') return;
    setSavingItemId(itemId);
    setActionError(null);
    try {
      const { item, resumo } = await api.patch<{ item: StockCountItem; resumo: ResumoDaContagem }>(
        `/inventory/stock-counts/${params.id}/items/${itemId}`,
        { countedQty: Number(valor) },
      );
      // Troca a linha no lugar e atualiza só os totais do cabeçalho. A peça
      // continua visível mesmo saindo do filtro "ainda não contadas": sumir da
      // tela no instante em que foi salva faz quem conta perder a referência
      // de onde estava.
      setItens((atuais) => atuais.map((i) => (i.id === itemId ? item : i)));
      setCount((atual) => (atual ? { ...atual, resumo } : atual));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível salvar a quantidade contada.');
    } finally {
      setSavingItemId(null);
    }
  }

  async function finalizar(acao: 'complete' | 'cancel') {
    setBusy(true);
    setActionError(null);
    try {
      setCount(await api.post<StockCount>(`/inventory/stock-counts/${params.id}/${acao}`));
      await carregarItens(pagina?.page ?? 1);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : `Não foi possível ${acao === 'complete' ? 'concluir' : 'cancelar'} a contagem.`,
      );
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorNotice message={error} />;
  if (!count) return <CarregandoFicha />;

  const { resumo } = count;
  const aberta = count.status === 'OPEN';

  return (
    <div>
      <button onClick={() => router.push('/stock-counts')} className="mb-4 text-sm text-suave hover:text-texto">
        ← Voltar
      </button>

      <div className="card mb-6 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="titulo-pagina">{count.warehouse.name}</h1>
          <span className="text-sm font-medium">{STATUS_LABEL[count.status]}</span>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Numero rotulo="Aberta em" valor={new Date(count.createdAt).toLocaleString('pt-BR')} />
          <Numero rotulo="Peças na contagem" valor={formatarNumero(resumo.total)} />
          <Numero rotulo="Ainda não contadas" valor={formatarNumero(resumo.pendentes)} />
          <Numero
            rotulo="Com divergência"
            valor={formatarNumero(resumo.divergentes)}
            destaque={resumo.divergentes > 0}
          />
        </dl>

        {count.notes && (
          <p className="mt-3 text-sm text-suave">
            <span className="text-tenue">Observações: </span>
            {count.notes}
          </p>
        )}

        {aberta && (
          <div className="mt-4 flex gap-2 border-t border-linha pt-4">
            <button onClick={() => finalizar('complete')} disabled={busy} className="btn-primary">
              {busy ? 'Concluindo…' : 'Concluir contagem'}
            </button>
            <button
              onClick={() => finalizar('cancel')}
              disabled={busy}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            >
              Cancelar contagem
            </button>
          </div>
        )}

        {count.status === 'COMPLETED' && (
          <p className="mt-4 border-t border-linha pt-3 text-sm text-emerald-700 dark:text-emerald-400">
            Divergências ajustadas no estoque em{' '}
            {count.completedAt && new Date(count.completedAt).toLocaleString('pt-BR')}.
          </p>
        )}

        {actionError && (
          <div className="mt-3">
            <ErrorNotice message={actionError} />
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              onClick={() => setSituacao(f.valor)}
              className={
                situacao === f.valor
                  ? 'rounded-lg bg-realce px-3 py-1.5 text-sm font-medium text-texto'
                  : 'rounded-lg px-3 py-1.5 text-sm text-suave hover:bg-realce'
              }
            >
              {f.rotulo}
            </button>
          ))}
        </div>
        <input
          className="input min-w-56 flex-1"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Bipe o código de barras ou busque por nome/SKU…"
        />
      </div>

      <div className="w-full overflow-x-auto">
        <table className="tabela card">
          <thead>
            <tr>
              <th>Peça</th>
              <th className="num">Sistema</th>
              <th className="num">Contado</th>
              <th className="num">Diferença</th>
              {aberta && <th />}
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => {
              const rascunho = drafts[item.id] ?? (item.countedQty === null ? '' : String(item.countedQty));
              const diff = item.countedQty === null ? null : item.countedQty - item.expectedQty;
              return (
                <tr key={item.id}>
                  <td>
                    {item.product.name} <span className="text-tenue">· {item.product.sku}</span>
                  </td>
                  <td className="num tabular-nums">{item.expectedQty}</td>
                  <td className="num">
                    {aberta ? (
                      <input
                        className="input w-24 text-right"
                        type="number"
                        step={1}
                        min={0}
                        value={rascunho}
                        aria-label={`Quantidade contada de ${item.product.name}`}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        // Contar é digitar número e seguir para a próxima peça:
                        // exigir o mouse no botão a cada linha dobra o trabalho.
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            salvar(item.id);
                          }
                        }}
                      />
                    ) : (
                      (item.countedQty ?? '—')
                    )}
                  </td>
                  <td
                    className={`num tabular-nums ${diff ? 'font-medium text-amber-700 dark:text-amber-400' : ''}`}
                  >
                    {diff === null ? '—' : diff > 0 ? `+${diff}` : diff}
                  </td>
                  {aberta && (
                    <td className="text-right">
                      <button
                        onClick={() => salvar(item.id)}
                        disabled={savingItemId === item.id || rascunho === ''}
                        className="btn-secondary text-xs disabled:opacity-50"
                      >
                        {savingItemId === item.id ? 'Salvando…' : 'Salvar'}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {!carregandoItens && itens.length === 0 && (
              <tr>
                <td colSpan={aberta ? 5 : 4} className="px-4 py-6 text-center text-tenue">
                  {situacao === 'PENDENTES' && !busca.trim()
                    ? 'Todas as peças já foram contadas.'
                    : 'Nenhuma peça encontrada com este filtro.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination data={pagina} onPageChange={(p) => carregarItens(p)} itemLabel="peças" />
    </div>
  );
}

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div>
      <dt className="text-tenue">{rotulo}</dt>
      <dd className={destaque ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-suave'}>{valor}</dd>
    </div>
  );
}
