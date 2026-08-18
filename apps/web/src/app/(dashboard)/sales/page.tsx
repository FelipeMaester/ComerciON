'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { BotaoCsv } from '@/components/BotaoCsv';
import { AvisoDeOrdenacaoPorPagina, CabecalhoOrdenavel, SeletorDeColunas } from '@/components/Tabela';
import { buscarTodasAsPaginas, useTabela, type Coluna } from '@/lib/tabela';
import { BuscaSemResultado, ListaVazia } from '@/components/ListaVazia';
import { getSaleFlowStatus } from '@/lib/saleStatus';
import { Pagination } from '@/components/Pagination';
import type { Paginated, Sale, SaleStatus } from '@/lib/types';
import { formatarMoeda } from '@/lib/format';

const STATUS_LABEL: Record<SaleStatus, string> = {
  QUOTE: 'Orçamento',
  CONFIRMED: 'Confirmada',
  CANCELED: 'Cancelada',
  RETURNED: 'Devolvida',
};

/**
 * Data e Cliente são fixas: sem as duas, uma linha de venda não diz de quem
 * nem de quando é.
 *
 * A data ordena pelo instante, não pelo texto formatado — ordenar
 * "18/08/2026" como string colocaria 1º de setembro antes de 2 de agosto.
 */
const COLUNAS: Coluna<Sale>[] = [
  { chave: 'data', titulo: 'Data', fixa: true, valor: (s) => new Date(s.createdAt).getTime() },
  { chave: 'cliente', titulo: 'Cliente', fixa: true, valor: (s) => s.customer?.name ?? 'Cliente avulso' },
  { chave: 'itens', titulo: 'Itens', numerica: true, valor: (s) => s.items.length },
  { chave: 'total', titulo: 'Total', numerica: true, valor: (s) => Number(s.total) },
  { chave: 'status', titulo: 'Status', valor: (s) => s.status },
];

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [pageInfo, setPageInfo] = useState<Paginated<Sale> | null>(null);
  const [status, setStatus] = useState<SaleStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tabela = useTabela<Sale>('vendas', COLUNAS, sales);
  const mostrar = (chave: string) => tabela.visiveis.some((c) => c.chave === chave);

  async function load(statusFilter?: SaleStatus | '', page = 1) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (statusFilter) params.set('status', statusFilter);
      const data = await api.get<Paginated<Sale>>(`/sales?${params}`);
      setSales(data.items);
      setPageInfo(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as vendas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="titulo-pagina">Vendas</h1>
        <Link href="/pos" className="btn-primary">
          Nova venda
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <select
          className="input max-w-xs"
          value={status}
          onChange={(e) => {
            const value = e.target.value as SaleStatus | '';
            setStatus(value);
            load(value);
          }}
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <BotaoCsv
            nomeBase="vendas"
            colunas={tabela.visiveis}
            itens={tabela.ordenados}
            total={pageInfo?.total}
            ordenar={tabela.ordenarLista}
            carregarTudo={() =>
              buscarTodasAsPaginas<Sale>(async (pagina, tamanho) => {
                const params = new URLSearchParams({ page: String(pagina), pageSize: String(tamanho) });
                if (status) params.set('status', status);
                return api.get<Paginated<Sale>>(`/sales?${params}`);
              })
            }
          />
          <SeletorDeColunas
            colunas={COLUNAS}
            escondidas={tabela.escondidas}
            aoAlternar={tabela.alternarColuna}
            aoRestaurar={tabela.restaurar}
          />
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <AvisoDeOrdenacaoPorPagina
        ordenando={Boolean(tabela.ordenacao)}
        naTela={tabela.ordenados.length}
        total={pageInfo?.total}
      />

      {loading ? (
        <CarregandoLista />
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="tabela card">
            <thead>
              <tr>
                {tabela.visiveis.map((coluna) => (
                  <CabecalhoOrdenavel
                    key={coluna.chave}
                    coluna={coluna}
                    ordenacao={tabela.ordenacao}
                    aoOrdenar={tabela.alternarOrdem}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {tabela.ordenados.map((s) => {
                const flowStatus = getSaleFlowStatus(s);
                return (
                  <tr key={s.id}>
                    {mostrar('data') && (
                      <td className="text-xs text-suave">{new Date(s.createdAt).toLocaleString('pt-BR')}</td>
                    )}
                    {mostrar('cliente') && (
                      <td>
                        <Link href={`/sales/${s.id}`} className="text-texto hover:underline">
                          {s.customer?.name ?? 'Cliente avulso'}
                        </Link>
                      </td>
                    )}
                    {mostrar('itens') && <td className="num">{s.items.length}</td>}
                    {mostrar('total') && <td className="num font-medium">{formatarMoeda(Number(s.total))}</td>}
                    {mostrar('status') && (
                      <td><span className={`${flowStatus.badgeClass} whitespace-nowrap`}>{flowStatus.label}</span></td>
                    )}
                  </tr>
                );
              })}
              {sales.length === 0 && (
                <ListaVazia
                  icone="vendas"
                  titulo="Nenhuma venda por aqui."
                  descricao="As vendas feitas no PDV aparecem nesta lista."
                  acao={{ rotulo: 'Abrir o PDV', href: '/pos' }}
                  colunas={tabela.visiveis.length}
                />
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination data={pageInfo} onPageChange={(p) => load(status, p)} itemLabel="vendas" />
    </div>
  );
}
