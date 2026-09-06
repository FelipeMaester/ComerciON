'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { ListaVazia } from '@/components/ListaVazia';
import { Pagination } from '@/components/Pagination';
import { SeletorDeProduto } from '@/components/SeletorDeProduto';
import { formatarMoeda, formatarNumero } from '@/lib/format';
import type { Paginated, PurchaseEntry, Supplier, Warehouse } from '@/lib/types';

/** Uma linha da nota sendo digitada. */
interface LinhaDaNota {
  productId: string;
  rotulo: string;
  quantity: string;
  unitCost: string;
}

export default function PurchasesPage() {
  const [entradas, setEntradas] = useState<PurchaseEntry[]>([]);
  const [pageInfo, setPageInfo] = useState<Paginated<PurchaseEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lancando, setLancando] = useState(false);

  async function load(page = 1) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Paginated<PurchaseEntry>>(`/purchase-entries?page=${page}`);
      setEntradas(data.items);
      setPageInfo(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as entradas.');
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
        <div>
          <h1 className="titulo-pagina">Entrada de mercadoria</h1>
          <p className="subtitulo mt-1">
            A nota do fornecedor chegando no estoque — e o custo das peças subindo junto.
          </p>
        </div>
        <button onClick={() => setLancando((v) => !v)} className="btn-primary">
          {lancando ? 'Cancelar' : 'Lançar nota'}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {lancando && (
        <FormularioDeEntrada
          aoLancar={() => {
            setLancando(false);
            load();
          }}
        />
      )}

      {loading ? (
        <CarregandoLista />
      ) : entradas.length === 0 ? (
        <ListaVazia
          icone="fornecedor"
          titulo="Nenhuma entrada lançada"
          descricao="Quando a mercadoria do fornecedor chegar, lance a nota aqui: o estoque sobe e o custo das peças é atualizado de uma vez."
        />
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="tabela card">
            <thead>
              <tr>
                <th>Recebida</th>
                <th>Nota</th>
                <th>Fornecedor</th>
                <th className="num">Itens</th>
                <th className="num">Total</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {entradas.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.receivedAt).toLocaleDateString('pt-BR')}</td>
                  <td>{e.invoiceNumber ?? <span className="text-tenue">sem número</span>}</td>
                  <td>{e.supplier?.name ?? <span className="text-tenue">não informado</span>}</td>
                  <td className="num">{formatarNumero(e.items.length)}</td>
                  <td className="num">{formatarMoeda(Number(e.total))}</td>
                  <td>
                    <SeloDaSituacao status={e.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination data={pageInfo} onPageChange={(p) => load(p)} itemLabel="entradas" />
    </div>
  );
}

function SeloDaSituacao({ status }: { status: PurchaseEntry['status'] }) {
  if (status === 'CONFIRMED') {
    return <span className="badge bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">No estoque</span>;
  }
  if (status === 'CANCELED') return <span className="badge text-tenue">Cancelada</span>;
  // Rascunho merece destaque: é mercadoria que chegou e ainda não conta.
  return <span className="badge bg-amber-500/10 text-amber-700 dark:text-amber-400">Rascunho</span>;
}

/**
 * A nota inteira numa tela só.
 *
 * O ponto da funcionalidade: antes, dar entrada era uma peça por vez pela tela
 * do produto. Uma nota com 40 itens eram 40 operações manuais, e não sobrava
 * registro do que foi comprado, de quem, por quanto, nem quando.
 */
function FormularioDeEntrada({ aoLancar }: { aoLancar: () => void }) {
  const [depositos, setDepositos] = useState<Warehouse[]>([]);
  const [fornecedores, setFornecedores] = useState<Supplier[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [linhas, setLinhas] = useState<LinhaDaNota[]>([]);
  const [gerarConta, setGerarConta] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Warehouse[]>('/warehouses')
      .then((d) => {
        setDepositos(d);
        const padrao = d.find((w) => w.isDefault) ?? d[0];
        if (padrao) setWarehouseId(padrao.id);
      })
      .catch(() => setErro('Não foi possível carregar os depósitos.'));
    api.get<Supplier[]>('/suppliers').then(setFornecedores).catch(() => undefined);
  }, []);

  const total = linhas.reduce(
    (soma, l) => soma + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
    0,
  );

  function adicionar(produto: { id: string; sku: string; name: string; costPrice?: string | number }) {
    setLinhas((atuais) => {
      if (atuais.some((l) => l.productId === produto.id)) return atuais;
      return [
        ...atuais,
        {
          productId: produto.id,
          rotulo: `${produto.sku} — ${produto.name}`,
          quantity: '1',
          // Começa com o custo que já está no cadastro: na maioria das notas o
          // preço não mudou, e digitar de novo o mesmo número é trabalho à toa.
          unitCost: String(Number(produto.costPrice ?? 0)),
        },
      ];
    });
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await api.post('/purchase-entries', {
        warehouseId,
        supplierId: supplierId || undefined,
        invoiceNumber: invoiceNumber || undefined,
        items: linhas.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost),
        })),
        confirm: true,
        gerarContaAPagar: gerarConta,
        dueDate: gerarConta && dueDate ? dueDate : undefined,
      });
      aoLancar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível lançar a entrada.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="card mb-6 p-4">
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-suave">Depósito</span>
          <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-suave">Fornecedor</span>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Não informado</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-suave">Número da nota</span>
          <input
            className="input"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="como está no papel"
          />
        </label>
      </div>

      <SeletorDeProduto aoEscolher={adicionar} />

      {linhas.length > 0 && (
        <div className="mt-4 w-full overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Peça</th>
                <th className="num">Qtd.</th>
                <th className="num">Custo unit.</th>
                <th className="num">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, i) => (
                <tr key={linha.productId}>
                  <td>{linha.rotulo}</td>
                  <td className="num">
                    <input
                      className="input w-20 text-right"
                      type="number"
                      min={1}
                      value={linha.quantity}
                      aria-label={`Quantidade de ${linha.rotulo}`}
                      onChange={(e) =>
                        setLinhas((atuais) =>
                          atuais.map((l, k) => (k === i ? { ...l, quantity: e.target.value } : l)),
                        )
                      }
                    />
                  </td>
                  <td className="num">
                    <input
                      className="input w-28 text-right"
                      type="number"
                      step="0.01"
                      min={0}
                      value={linha.unitCost}
                      aria-label={`Custo de ${linha.rotulo}`}
                      onChange={(e) =>
                        setLinhas((atuais) =>
                          atuais.map((l, k) => (k === i ? { ...l, unitCost: e.target.value } : l)),
                        )
                      }
                    />
                  </td>
                  <td className="num tabular-nums">
                    {formatarMoeda((Number(linha.quantity) || 0) * (Number(linha.unitCost) || 0))}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={() => setLinhas((atuais) => atuais.filter((_, k) => k !== i))}
                      className="acao-em-celula text-suave hover:text-texto"
                    >
                      remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-linha pt-4">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-suave">
            <input type="checkbox" checked={gerarConta} onChange={(e) => setGerarConta(e.target.checked)} />
            Gerar conta a pagar no Financeiro
          </label>
          {/* Nem toda entrada vira dívida: mercadoria paga à vista na hora não
              pode virar pendência. Por isso a caixa vem desmarcada. */}
          {gerarConta && (
            <label className="block text-sm">
              <span className="mb-1 block text-suave">Vencimento</span>
              <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          )}
        </div>

        <div className="text-right">
          <p className="text-sm text-suave">Total da nota</p>
          <p className="text-xl font-semibold tabular-nums text-texto">{formatarMoeda(total)}</p>
        </div>
      </div>

      {erro && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{erro}</p>}

      <div className="mt-4">
        <button type="submit" disabled={salvando || linhas.length === 0} className="btn-primary">
          {salvando ? 'Lançando…' : 'Lançar e dar entrada no estoque'}
        </button>
        {linhas.length === 0 && (
          <span className="ml-3 text-sm text-tenue">Busque as peças da nota acima para começar.</span>
        )}
      </div>
    </form>
  );
}
