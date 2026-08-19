'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { AcoesDaLinha } from '@/components/AcoesDaLinha';
import { useAviso } from '@/components/Avisos';
import { BotaoCsv } from '@/components/BotaoCsv';
import { AvisoDeOrdenacaoPorPagina, CabecalhoOrdenavel, SeletorDeColunas } from '@/components/Tabela';
import { buscarTodasAsPaginas, comOrdenacao, useTabela, type Coluna } from '@/lib/tabela';
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
  { chave: 'data', titulo: 'Data', fixa: true, noServidor: true, valor: (s) => new Date(s.createdAt).getTime() },
  { chave: 'cliente', titulo: 'Cliente', fixa: true, noServidor: true, valor: (s) => s.customer?.name ?? 'Cliente avulso' },
  { chave: 'itens', titulo: 'Itens', numerica: true, valor: (s) => s.items.length },
  { chave: 'total', titulo: 'Total', numerica: true, noServidor: true, valor: (s) => Number(s.total) },
  { chave: 'status', titulo: 'Status', noServidor: true, valor: (s) => s.status },
];

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [pageInfo, setPageInfo] = useState<Paginated<Sale> | null>(null);
  const [status, setStatus] = useState<SaleStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tabela = useTabela<Sale>('vendas', COLUNAS, sales);
  const { ordenacaoNoServidor } = tabela;
  const mostrar = (chave: string) => tabela.visiveis.some((c) => c.chave === chave);
  const avisar = useAviso();
  /** Venda esperando confirmação de cancelamento ou devolução. */
  const [emConfirmacao, setEmConfirmacao] = useState<{ venda: Sale; tipo: 'cancelar' | 'devolver' } | null>(null);
  const [executando, setExecutando] = useState(false);

  async function confirmar() {
    if (!emConfirmacao) return;
    const { venda, tipo } = emConfirmacao;
    setExecutando(true);
    try {
      await api.post(`/sales/${venda.id}/${tipo === 'cancelar' ? 'cancel' : 'return'}`, {});
      avisar(tipo === 'cancelar' ? 'Orçamento cancelado.' : 'Devolução registrada — estoque e financeiro ajustados.');
      setEmConfirmacao(null);
      load(status, pageInfo?.page ?? 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir a operação.');
      setEmConfirmacao(null);
    } finally {
      setExecutando(false);
    }
  }

  async function load(statusFilter?: SaleStatus | '', page = 1) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (statusFilter) params.set('status', statusFilter);
      const data = await api.get<Paginated<Sale>>(`/sales?${comOrdenacao(params, ordenacaoNoServidor)}`);
      setSales(data.items);
      setPageInfo(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as vendas.');
    } finally {
      setLoading(false);
    }
  }

  // Só pede a lista depois de ler a preferência gravada: a ordem escolhida vai
  // no pedido, e disparar antes de saber qual é seria buscar duas vezes, a
  // segunda desfazendo a primeira. E refaz o pedido quando a ordem muda, porque
  // agora quem ordena é o banco — voltando à página 1, já que depois de
  // reordenar a linha que estava na página 3 não está mais lá.
  useEffect(() => {
    if (!tabela.carregou) return;
    load(status, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabela.carregou, ordenacaoNoServidor]);

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
                return api.get<Paginated<Sale>>(`/sales?${comOrdenacao(params, ordenacaoNoServidor)}`);
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
        ordenando={tabela.ordenandoNoCliente}
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
                <th className="w-px" />
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
                    <td className="w-px pr-2">
                      <AcoesDaLinha
                        rotulo={`Ações da venda de ${s.customer?.name ?? 'cliente avulso'}`}
                        acoes={[
                          { rotulo: 'Ver a venda', href: `/sales/${s.id}` },
                          // Segunda via do cupom: o cliente que volta com a peça
                          // costuma ter perdido o papel.
                          { rotulo: 'Imprimir cupom', href: `/print/sale/${s.id}` },
                          // Duas ações diferentes, porque são coisas diferentes:
                          // orçamento se cancela e some; venda confirmada se
                          // devolve, e devolver mexe em estoque e em dinheiro.
                          // Um único "Cancelar venda" prometeria o que a API
                          // não faz.
                          {
                            rotulo: 'Cancelar orçamento',
                            oculta: s.status !== 'QUOTE',
                            perigo: true,
                            aoClicar: () => setEmConfirmacao({ venda: s, tipo: 'cancelar' }),
                          },
                          {
                            rotulo: 'Registrar devolução',
                            oculta: s.status !== 'CONFIRMED',
                            perigo: true,
                            aoClicar: () => setEmConfirmacao({ venda: s, tipo: 'devolver' }),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
              {sales.length === 0 && (
                <ListaVazia
                  icone="vendas"
                  titulo="Nenhuma venda por aqui."
                  descricao="As vendas feitas no PDV aparecem nesta lista."
                  acao={{ rotulo: 'Abrir o PDV', href: '/pos' }}
                  colunas={tabela.visiveis.length + 1}
                />
              )}
            </tbody>
          </table>
        </div>
      )}

      <Pagination data={pageInfo} onPageChange={(p) => load(status, p)} itemLabel="vendas" />

      {/* Confirmação dentro da tela, e não `window.confirm`: o diálogo nativo
          pode ser suprimido pelo navegador, e aí o clique morre em silêncio —
          foi exatamente o que aconteceu no fechamento do caixa. Aqui também
          importa MOSTRAR o que vai acontecer: devolução mexe em estoque e em
          dinheiro, e ninguém deveria descobrir isso depois. */}
      {emConfirmacao && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={emConfirmacao.tipo === 'cancelar' ? 'Cancelar orçamento' : 'Registrar devolução'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={() => !executando && setEmConfirmacao(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-md p-5">
            <h2 className="text-base font-semibold text-texto">
              {emConfirmacao.tipo === 'cancelar' ? 'Cancelar este orçamento?' : 'Registrar a devolução?'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-suave">
              {emConfirmacao.tipo === 'cancelar' ? (
                <>
                  O orçamento de{' '}
                  <strong className="text-texto">{emConfirmacao.venda.customer?.name ?? 'cliente avulso'}</strong>, no
                  valor de <strong className="text-texto">{formatarMoeda(Number(emConfirmacao.venda.total))}</strong>,
                  passa a constar como cancelado. Nada muda no estoque, porque orçamento não deu baixa.
                </>
              ) : (
                <>
                  As <strong className="text-texto">{emConfirmacao.venda.items.length} peça(s)</strong> voltam para o
                  estoque e o financeiro é estornado — inclusive o que já foi pago, que passa a constar como saída de{' '}
                  <strong className="text-texto">{formatarMoeda(Number(emConfirmacao.venda.total))}</strong>.
                </>
              )}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <button autoFocus onClick={confirmar} disabled={executando} className="btn-danger">
                {executando
                  ? 'Registrando…'
                  : emConfirmacao.tipo === 'cancelar'
                    ? 'Cancelar o orçamento'
                    : 'Registrar a devolução'}
              </button>
              <button onClick={() => setEmConfirmacao(null)} disabled={executando} className="btn-secondary">
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
