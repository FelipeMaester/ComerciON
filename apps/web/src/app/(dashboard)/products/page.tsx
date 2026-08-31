'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { CarregandoLista } from '@/components/Carregando';
import { AcoesDaLinha } from '@/components/AcoesDaLinha';
import { useAviso } from '@/components/Avisos';
import { BotaoCsv } from '@/components/BotaoCsv';
import { AvisoDeOrdenacaoPorPagina, CabecalhoOrdenavel, SeletorDeColunas } from '@/components/Tabela';
import { buscarTodasAsPaginas, comOrdenacao, useTabela, type Coluna } from '@/lib/tabela';
import { BuscaSemResultado, ListaVazia } from '@/components/ListaVazia';
import { Pagination } from '@/components/Pagination';
import { SeletorDeCategoria } from '@/components/SeletorDeCategoria';
import type { Category, Paginated, Product } from '@/lib/types';
import { formatarMoeda, formatarNumero } from '@/lib/format';
import { usePedidoMaisRecente } from '@/lib/pedido-mais-recente';

/**
 * As colunas da lista de peças: o que cada uma vale para ordenar e quais
 * podem ser escondidas.
 *
 * SKU e Nome são fixas porque são o que identifica a linha — esconder as
 * duas deixaria uma tabela de preços sem dizer de qual peça.
 *
 * Fora do componente para a referência não mudar a cada render: o hook
 * memoriza a ordenação em cima dela.
 */
const COLUNAS: Coluna<Product>[] = [
  { chave: 'sku', titulo: 'SKU', fixa: true, noServidor: true, valor: (p) => p.sku },
  { chave: 'nome', titulo: 'Nome', fixa: true, noServidor: true, valor: (p) => p.name },
  { chave: 'marca', titulo: 'Marca', noServidor: true, valor: (p) => p.brand },
  { chave: 'preco', titulo: 'Preço', numerica: true, noServidor: true, valor: (p) => Number(p.price) },
  { chave: 'estoque', titulo: 'Estoque', numerica: true, valor: (p) => p.totalQuantity ?? 0 },
  { chave: 'minimo', titulo: 'Mínimo', numerica: true, noServidor: true, valor: (p) => p.minStock },
];

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pageInfo, setPageInfo] = useState<Paginated<Product> | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  // Vem do endereço: a tela de Categorias linka com ?categoria=… e o sino de
  // avisos linka com ?estoque=baixo. Aviso que obriga a procurar o que ele
  // mesmo acabou de contar não economiza trabalho nenhum.
  const parametros = useSearchParams();
  const categoriaFiltrada = parametros.get('categoria') ?? '';
  const estoqueBaixoNoEndereco = parametros.get('estoque') === 'baixo';

  const [lowStockOnly, setLowStockOnly] = useState(estoqueBaixoNoEndereco);
  // Ordenação e colunas ficam guardadas por pessoa: quem trabalha no balcão
  // organiza a lista de um jeito e quem compra, de outro.
  const tabela = useTabela<Product>('produtos', COLUNAS, products);
  const { ordenacaoNoServidor } = tabela;
  const mostrar = (chave: string) => tabela.visiveis.some((c) => c.chave === chave);
  const avisar = useAviso();

  async function copiarSku(sku: string) {
    try {
      await navigator.clipboard.writeText(sku);
      avisar(`SKU ${sku} copiado.`);
    } catch {
      // Área de transferência bloqueada (acontece fora de HTTPS): melhor
      // dizer do que fingir que copiou.
      setError('Não foi possível copiar — o navegador bloqueou a área de transferência.');
    }
  }

  async function alternarAtiva(peca: Product) {
    const acao = peca.isActive ? 'deactivate' : 'activate';
    try {
      await api.patch(`/products/${peca.id}/${acao}`);
      avisar(peca.isActive ? `${peca.name} foi desativada.` : `${peca.name} voltou para a lista.`);
      load(search, lowStockOnly, pageInfo?.page ?? 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível mudar a situação da peça.');
    }
  }

  const novoPedido = usePedidoMaisRecente();

  async function load(searchTerm?: string, onlyLowStock?: boolean, page = 1, categoria = categoriaFiltrada) {
    // Esta tela tem quatro gatilhos de carregamento (busca, filtro de estoque,
    // categoria e ordenação) e nada impede o lojista de acionar o segundo antes
    // de o primeiro voltar. Sem isto, quem chega atrasado escreve por cima de
    // quem chegou na hora.
    const aindaVale = novoPedido();
    setLoading(true);
    setError(null);
    try {
      if (onlyLowStock) {
        // "Abaixo do mínimo" é uma lista curta por natureza (se for longa, o
        // problema é de compras, não de paginação) — segue devolvendo array.
        const curta = await api.get<Product[]>('/products/low-stock');
        if (!aindaVale()) return;
        setProducts(curta);
        setPageInfo(null);
        return;
      }
      const params = new URLSearchParams({ page: String(page) });
      if (searchTerm) params.set('search', searchTerm);
      // A API já sabia filtrar por categoria; faltava alguém pedir. É o que
      // faz o número de peças da tela de Categorias virar um link útil.
      if (categoria) params.set('categoryId', categoria);
      const data = await api.get<Paginated<Product>>(`/products?${comOrdenacao(params, ordenacaoNoServidor)}`);
      if (!aindaVale()) return;
      setProducts(data.items);
      setPageInfo(data);
    } catch (err) {
      if (!aindaVale()) return;
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os produtos.');
    } finally {
      // Só o pedido mais recente apaga o "carregando" — senão o antigo o apaga
      // enquanto o novo ainda está no ar, e a tela finge estar pronta.
      if (aindaVale()) setLoading(false);
    }
  }

  /**
   * Quem marca e desmarca "só estoque baixo" é o endereço — e só ele.
   *
   * Separado do efeito que busca a lista por um motivo concreto: os dois
   * chegaram a dividir o mesmo efeito, e como a ordenação também passou a
   * disparar esse efeito, cada clique no cabeçalho remarcava o filtro a partir
   * da URL. Quem chegava pelo aviso de estoque baixo, desmarcava para ver o
   * catálogo inteiro e clicava em "Preço" via a lista encolher de volta
   * sozinha. Ordenar não é navegar; não pode mexer em filtro nenhum.
   */
  useEffect(() => {
    setLowStockOnly(estoqueBaixoNoEndereco);
  }, [estoqueBaixoNoEndereco]);

  // As categorias não dependem de nada da lista: uma vez só.
  useEffect(() => {
    api.get<Category[]>('/categories').then(setCategories).catch(() => undefined);
  }, []);

  /**
   * Um único lugar que pede a lista, sempre com os filtros que estão valendo.
   *
   * Espera a preferência gravada ser lida porque a ordem escolhida vai no
   * pedido — disparar antes seria buscar duas vezes, a segunda desfazendo a
   * primeira. Volta à página 1 a cada mudança: depois de reordenar ou filtrar,
   * a linha que estava na página 3 não está mais lá.
   */
  useEffect(() => {
    if (!tabela.carregou) return;
    load(search, lowStockOnly, 1, categoriaFiltrada);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabela.carregou, ordenacaoNoServidor, categoriaFiltrada, lowStockOnly]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="titulo-pagina">Produtos</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary"
        >
          {showForm ? 'Cancelar' : 'Novo produto'}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(search, lowStockOnly);
          }}
          className="flex gap-2"
        >
          <input
            className="input max-w-xs"
            placeholder="Buscar por nome, SKU ou código de barras..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn-secondary">
            Buscar
          </button>
        </form>
        <label className="flex items-center gap-2 text-sm text-suave">
          <input
            type="checkbox"
            checked={lowStockOnly}
            // Só muda o estado: quem pede a lista é o efeito, que já observa
            // este filtro. Chamar load aqui também faria duas buscas por clique.
            onChange={(e) => setLowStockOnly(e.target.checked)}
          />
          Só estoque baixo
        </label>

        {/* Filtro vindo do endereço precisa ser visível e ter saída. Lista
            filtrada sem aviso é a receita para "sumiram meus produtos". */}
        {categoriaFiltrada && (
          <span className="badge badge-marca gap-1.5">
            {categories.find((c) => c.id === categoriaFiltrada)?.name ?? 'Categoria'}
            <Link href="/products" className="text-marca-legivel hover:opacity-70" aria-label="Remover filtro de categoria">
              ×
            </Link>
          </span>
        )}

        {/* Empurrado para a direita: é ajuste de exibição, não filtro de
            busca — misturar os dois faria a pessoa procurar o filtro aqui. */}
        <div className="ml-auto flex items-center gap-2">
          <BotaoCsv
            nomeBase="pecas"
            colunas={tabela.visiveis}
            itens={tabela.ordenados}
            total={pageInfo?.total}
            ordenar={tabela.ordenarLista}
            carregarTudo={() =>
              buscarTodasAsPaginas<Product>(async (pagina, tamanho) => {
                const params = new URLSearchParams({ page: String(pagina), pageSize: String(tamanho) });
                if (search) params.set('search', search);
                if (categoriaFiltrada) params.set('categoryId', categoriaFiltrada);
                return api.get<Paginated<Product>>(`/products?${comOrdenacao(params, ordenacaoNoServidor)}`);
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

      {showForm && (
        <CreateProductForm
          categories={categories}
          onCategoriaCriada={(nova) =>
            setCategories((atuais) => [...atuais, nova].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
          }
          onCreated={() => {
            setShowForm(false);
            load(search, lowStockOnly);
          }}
        />
      )}

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
                {/* Coluna da alça: sem cabeçalho, porque "Ações" escrito ali
                    ocuparia largura para nomear o óbvio. */}
                <th className="w-px" />
              </tr>
            </thead>
            <tbody>
              {tabela.ordenados.map((p) => (
                <tr key={p.id}>
                  {/* As células seguem a mesma ordem das colunas declaradas,
                      então esconder uma nunca desalinha a linha do cabeçalho. */}
                  {mostrar('sku') && <td className="font-mono text-xs">{p.sku}</td>}
                  {mostrar('nome') && (
                    <td>
                      <Link href={`/products/${p.id}`} className="text-texto hover:underline">
                        {p.name}
                      </Link>
                      {/* A lista traz ativas e inativas juntas, e até aqui elas
                          eram idênticas na tela: desativar uma peça parecia não
                          fazer nada. A etiqueta é o que dá sentido à ação. */}
                      {!p.isActive && <span className="badge badge-neutro ml-2">Inativa</span>}
                      {p.vehicleApplication && (
                        <div className="text-xs text-tenue">{p.vehicleApplication}</div>
                      )}
                    </td>
                  )}
                  {mostrar('marca') && <td>{p.brand ?? '—'}</td>}
                  {mostrar('preco') && <td className="num font-medium">{formatarMoeda(Number(p.price))}</td>}
                  {mostrar('estoque') && (
                    <td className="num">
                      <SaldoEmEstoque quantidade={p.totalQuantity} minimo={p.minStock} />
                    </td>
                  )}
                  {mostrar('minimo') && <td className="num text-suave">{p.minStock}</td>}
                  {/* Fora do sistema de colunas de propósito: não é informação
                      que se esconde nem se ordena, é a alça da linha. */}
                  <td className="w-px pr-2">
                    <AcoesDaLinha
                      rotulo={`Ações de ${p.name}`}
                      acoes={[
                        { rotulo: 'Abrir ficha', href: `/products/${p.id}` },
                        // Leva a peça junto: sem isso, "vender" abriria o PDV
                        // vazio e a pessoa digitaria de novo o que acabou de ler.
                        { rotulo: 'Vender no PDV', href: `/pos?busca=${encodeURIComponent(p.sku)}` },
                        // Pelo mesmo motivo do item acima: quem lê "há 0 em
                        // Loja Principal" no balcão precisa de um caminho até
                        // a entrada de estoque. Ele existia só dentro da ficha,
                        // sem placa em lugar nenhum — e a coluna de estoque
                        // fica bem aqui, nesta mesma linha.
                        { rotulo: 'Movimentar estoque', href: `/products/${p.id}#estoque` },
                        { rotulo: 'Copiar SKU', aoClicar: () => copiarSku(p.sku) },
                        {
                          rotulo: p.isActive ? 'Desativar peça' : 'Reativar peça',
                          perigo: p.isActive,
                          aoClicar: () => alternarAtiva(p),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {products.length === 0 &&
                // Busca sem resultado e estoque vazio são situações
                // diferentes: numa a saída é corrigir o termo, na outra é
                // cadastrar a primeira peça.
                (search || categoriaFiltrada || lowStockOnly ? (
                  <BuscaSemResultado termo={search || 'este filtro'} colunas={tabela.visiveis.length + 1} />
                ) : (
                  <ListaVazia
                    icone="produto"
                    titulo="Nenhuma peça cadastrada ainda."
                    descricao="Cadastre a primeira para começar a vender e controlar o estoque."
                    acao={{ rotulo: 'Cadastrar peça', aoClicar: () => setShowForm(true) }}
                    colunas={tabela.visiveis.length + 1}
                  />
                ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination data={pageInfo} onPageChange={(p) => load(search, false, p)} itemLabel="produtos" />
    </div>
  );
}

/**
 * Quanto tem da peça, somando todos os depósitos.
 *
 * A lista mostrava só o estoque mínimo — o número que diz quando comprar, sem
 * o número que diz se já passou da hora. Quem abre esta tela para conferir o
 * que está acabando tinha de entrar peça por peça.
 *
 * A cor faz a leitura: zero em vermelho, no limite ou abaixo em âmbar. O resto
 * fica preto, senão a cor vira ruído e para de significar alguma coisa.
 */
function SaldoEmEstoque({ quantidade, minimo }: { quantidade?: number; minimo: number }) {
  // A API só omite isto em respostas que não passam pela listagem; melhor um
  // travessão do que um "0" que seria mentira.
  if (quantidade === undefined) return <span className="text-tenue">—</span>;

  const cor =
    quantidade <= 0
      ? 'text-red-600 dark:text-red-400 font-semibold'
      : quantidade <= minimo
        ? 'text-amber-700 dark:text-amber-400 font-semibold'
        : '';

  return (
    <span
      className={cor}
      title={
        quantidade <= 0
          ? 'Sem estoque em nenhum depósito'
          : quantidade <= minimo
            ? `No limite ou abaixo do mínimo (${minimo})`
            : 'Soma de todos os depósitos'
      }
    >
      {formatarNumero(quantidade)}
    </span>
  );
}

function CreateProductForm({
  categories,
  onCreated,
  onCategoriaCriada,
}: {
  categories: Category[];
  onCreated: () => void;
  onCategoriaCriada: (nova: Category) => void;
}) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [vehicleApplication, setVehicleApplication] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [price, setPrice] = useState('');
  const [minStock, setMinStock] = useState('');
  const [ncm, setNcm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/products', {
        sku,
        name,
        brand: brand || undefined,
        vehicleApplication: vehicleApplication || undefined,
        categoryId: categoryId || undefined,
        costPrice: Number(costPrice),
        price: Number(price),
        minStock: Number(minStock),
        // Sem NCM a SEFAZ não aceita a nota, e o produto ficava impossível de
        // faturar. Opcional aqui: quem não emite nota não precisa preencher, e
        // quem precisa pode completar depois na tela do produto.
        ncm: ncm.replace(/\D/g, '') || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o produto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card mb-6 grid grid-cols-1 gap-3 p-4 sm:grid-cols-3"
    >
      <input className="input" placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} required />
      <input
        className="input sm:col-span-2"
        placeholder="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input className="input" placeholder="Marca" value={brand} onChange={(e) => setBrand(e.target.value)} />
      <input
        className="input sm:col-span-2"
        placeholder='Aplicação de veículo (ex: "Gol G5/G6 1.0/1.6 2008-2014")'
        value={vehicleApplication}
        onChange={(e) => setVehicleApplication(e.target.value)}
      />
      <SeletorDeCategoria
        categorias={categories}
        valor={categoryId}
        aoEscolher={setCategoryId}
        aoCriar={onCategoriaCriada}
      />
      <input
        className="input"
        type="number"
        step="0.01"
        placeholder="Preço de custo"
        value={costPrice}
        onChange={(e) => setCostPrice(e.target.value)}
      />
      <input
        className="input"
        type="number"
        step="0.01"
        placeholder="Preço de venda"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <input
        className="input"
        type="number"
        step={1}
        min={0}
        placeholder="Estoque mínimo"
        value={minStock}
        onChange={(e) => setMinStock(e.target.value)}
      />
      <input
        className="input"
        inputMode="numeric"
        maxLength={10}
        placeholder="NCM (8 dígitos, para nota fiscal)"
        value={ncm}
        onChange={(e) => setNcm(e.target.value)}
      />

      {error && <p className="col-span-full text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
