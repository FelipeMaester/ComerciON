'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { cardFeeAmount as computeCardFeeAmount, grossUpForCardFee } from '@/lib/cardFee';
import type { CashSession, Customer, Paginated, PaymentMethod, Product, Sale, StockItem, TenantSettings, Warehouse } from '@/lib/types';

interface CartLine {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  /**
   * Saldo no depósito selecionado, lido quando a peça entrou no carrinho.
   *
   * Serve para avisar antes de finalizar ("tem 3, você pediu 10"), não como
   * garantia: quem decide de fato é o UPDATE condicional do servidor na
   * confirmação. Entre digitar e confirmar, outro caixa pode ter vendido a
   * mesma peça — e é isso que a trava no banco resolve.
   */
  estoque: number;
}

type PosPaymentMethod = PaymentMethod | 'FIADO';

const INSTALLMENT_COUNTS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Quantos resultados a busca mostra — e, portanto, quantos as setas percorrem. */
const MAX_SUGGESTIONS_SHOWN = 8;

/**
 * Atalhos do balcão. Teclas de função, e não combinações com Ctrl, por dois
 * motivos: não conflitam com o que o operador está digitando num campo, e são
 * as mesmas que quem já usou outro PDV espera encontrar.
 *
 * F12 ficou de fora de propósito (abre o DevTools em vários navegadores e não
 * dá para interceptar de forma confiável).
 */
const SHORTCUTS: { key: string; label: string }[] = [
  { key: 'F2', label: 'Buscar produto' },
  { key: 'F3', label: 'Cliente' },
  { key: 'F4', label: 'Pagamento' },
  { key: 'F9', label: 'Finalizar venda' },
  { key: 'Esc', label: 'Limpar busca' },
];

interface PaymentLine {
  method: PosPaymentMethod;
  installments: number;
  // Cartão de crédito: `amount` guarda o valor BASE (o que o lojista quer
  // receber); o valor cobrado do cliente (com a taxa repassada) é derivado
  // via cardFeePercent — ver grossAmount() abaixo. Para as demais formas,
  // `amount` já é o valor final.
  amount: number;
  days?: number;
  cardFeePercent?: number;
}

/**
 * Quanto tem no depósito, com a cor dizendo o que fazer.
 *
 * Zero em vermelho e não "—": no balcão, "sem estoque" é informação, e é
 * diferente de "não sei".
 */
function EstoqueSelo({ quantidade, pedido }: { quantidade: number; pedido?: number }) {
  const faltando = pedido !== undefined && pedido > quantidade;
  const cor = faltando || quantidade <= 0
    ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
    : quantidade <= 3
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${cor}`}
      title={faltando ? `Pedido ${pedido}, mas há ${quantidade} no depósito` : 'Estoque no depósito selecionado'}
    >
      {quantidade} em estoque
    </span>
  );
}

const PAYMENT_LABEL: Record<PosPaymentMethod, string> = {
  CASH: 'Dinheiro',
  DEBIT_CARD: 'Cartão de débito',
  CREDIT_CARD: 'Cartão de crédito',
  PIX: 'PIX',
  BOLETO: 'Boleto',
  FIADO: 'Fiado',
};

export default function PosPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cardFeeRates, setCardFeeRates] = useState<number[]>(Array(12).fill(0));

  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [saleDiscount, setSaleDiscount] = useState('0');
  const [payments, setPayments] = useState<PaymentLine[]>([{ method: 'CASH', installments: 1, amount: 0 }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [cashSession, setCashSession] = useState<CashSession | null | undefined>(undefined);

  // Navegação por teclado da busca de produto.
  const [highlight, setHighlight] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  // Trava contra bipagem dupla enquanto uma consulta está em andamento.
  const [lookingUp, setLookingUp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // O carrinho num ref para o efeito de troca de depósito poder ler os itens
  // atuais sem se re-disparar a cada bipagem.
  const cartRef = useRef<CartLine[]>([]);
  cartRef.current = cart;
  const customerRef = useRef<HTMLSelectElement>(null);
  const paymentRef = useRef<HTMLInputElement>(null);
  const finalizeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // `undefined` = ainda carregando, `null` = confirmadamente sem caixa
    // aberto. A distinção evita a faixa de aviso piscar na abertura da tela.
    api
      .get<CashSession | null>('/cash/current')
      .then((data) => setCashSession(data ?? null))
      .catch(() => setCashSession(null));
    // Só os primeiros clientes: o seletor tem busca própria (ver adiante) e
    // uma base grande não precisa vir inteira só para preencher um <select>.
    api
      .get<Paginated<Customer>>('/customers?pageSize=100')
      .then((data) => setCustomers(data.items))
      .catch(() => undefined);
    api.get<Warehouse[]>('/warehouses').then((data) => {
      setWarehouses(data);
      const def = data.find((w) => w.isDefault) ?? data[0];
      if (def) setWarehouseId(def.id);
    });
    api
      .get<TenantSettings>('/settings')
      .then((data) => setCardFeeRates(data.cardFeeRates && data.cardFeeRates.length === 12 ? data.cardFeeRates : Array(12).fill(0)))
      .catch(() => undefined);
  }, []);

  // Cartão de crédito: `p.amount` é o valor base desejado, o valor
  // efetivamente cobrado (com o repasse da taxa) é derivado daqui.
  function grossAmount(p: PaymentLine): number {
    if (p.method !== 'CREDIT_CARD') return Number(p.amount || 0);
    return grossUpForCardFee(Number(p.amount || 0), p.cardFeePercent ?? 0);
  }

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [cart],
  );
  const totalCardFee = payments
    .filter((p) => p.method === 'CREDIT_CARD')
    .reduce((sum, p) => sum + computeCardFeeAmount(Number(p.amount || 0), p.cardFeePercent ?? 0), 0);
  const total = Math.max(0, subtotal - Number(saleDiscount || 0)) + totalCardFee;
  const paymentsSum = payments.reduce((sum, p) => sum + grossAmount(p), 0);
  const paymentsMatch = Math.abs(paymentsSum - total) < 0.01;
  const selectedCustomer = customers.find((c) => c.id === customerId);
  // Fiado exige um cliente identificado (não dá pra cobrar "cliente avulso"
  // depois) — qualquer cliente cadastrado serve, não precisa de nenhum
  // cadastro prévio especial.
  const canFiado = !!customerId;
  const remaining = Math.max(0, Math.round((total - paymentsSum) * 100) / 100);
  const fiadoLine = payments.find((p) => p.method === 'FIADO');

  // `products` agora guarda APENAS o resultado da última busca no servidor,
  // não o catálogo inteiro. A filtragem acontece no banco.
  const visibleProducts = products.slice(0, MAX_SUGGESTIONS_SHOWN);

  function addToCart(product: Product) {
    const unitPrice = Number(product.price);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          quantity: 1,
          unitPrice,
          estoque: product.totalQuantity ?? 0,
        },
      ];
    });
    // Limpa e devolve o foco: é o ciclo do balcão — bipa, bipa, bipa, sem
    // encostar no mouse entre um item e outro.
    setProductQuery('');
    setHighlight(0);
    setScanError(null);
    searchRef.current?.focus();
  }

  /**
   * Enter no campo de busca.
   *
   * Um leitor de código de barras é, para o navegador, um teclado muito
   * rápido que termina com Enter. Não precisamos detectar a velocidade da
   * digitação: basta que, ao receber Enter, o código lido case EXATAMENTE com
   * um código de barras ou SKU. Essa correspondência exata tem prioridade
   * sobre o item destacado porque o número lido pode aparecer no meio do nome
   * de outro produto — e aí a bipagem adicionaria a peça errada.
   */
  async function submitSearch() {
    const query = productQuery.trim();
    if (!query || lookingUp) return;

    // Se a lista visível já corresponde ao que está digitado, usa o que está
    // na tela — é o caso de quem digitou e escolheu com as setas.
    let candidatos = visibleProducts;

    // Mas o leitor de código de barras dispara o Enter antes dos 200ms de
    // espera da busca, então nesse caminho a lista ainda está vazia. Aqui a
    // consulta é feita na hora, sem esperar o debounce.
    if (candidatos.length === 0) {
      setLookingUp(true);
      try {
        const data = await api.get<Paginated<Product>>(
          `/products?search=${encodeURIComponent(query)}&pageSize=${MAX_SUGGESTIONS_SHOWN}${warehouseId ? `&warehouseId=${warehouseId}` : ''}`,
        );
        candidatos = data.items;
      } catch {
        setScanError('Não foi possível consultar o produto. Verifique a conexão.');
        return;
      } finally {
        setLookingUp(false);
      }
    }

    // Correspondência exata tem prioridade sobre o item destacado: o número
    // lido pode aparecer no meio do nome de outro produto, e aí a bipagem
    // adicionaria a peça errada.
    const exact =
      candidatos.find((p) => p.barcode && p.barcode === query) ??
      candidatos.find((p) => p.sku.toLowerCase() === query.toLowerCase());

    if (exact) {
      addToCart(exact);
      return;
    }
    if (candidatos.length > 0) {
      addToCart(candidatos[Math.min(highlight, candidatos.length - 1)]);
      return;
    }
    // Sem aviso, quem bipa um item não cadastrado acha que adicionou e só
    // descobre o erro no total.
    setScanError(`Nenhum produto encontrado para "${query}".`);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, visibleProducts.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      submitSearch();
      return;
    }
    if (e.key === 'Escape') {
      setProductQuery('');
      setScanError(null);
    }
  }

  function updateQuantity(productId: string, quantity: number) {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(1, quantity) } : l)));
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  function updatePayment(index: number, patch: Partial<PaymentLine>) {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addPaymentLine() {
    setPayments((prev) => [...prev, { method: 'CASH', installments: 1, amount: 0 }]);
  }

  function removePaymentLine(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  }

  /**
   * Busca de produto no SERVIDOR, com espera curta entre as teclas.
   *
   * Antes o PDV baixava o catálogo inteiro na abertura e filtrava em memória —
   * numa loja com milhares de SKUs, vários MB por abertura de caixa. Agora
   * cada busca é uma consulta indexada que devolve no máximo 8 linhas.
   *
   * Os 200ms de espera existem por causa do leitor de código de barras: ele
   * "digita" o código inteiro em milissegundos, e sem a espera dispararia uma
   * requisição por caractere. Com ela, sai uma só, com o código completo.
   */
  useEffect(() => {
    setHighlight(0);
    const query = productQuery.trim();
    if (!query) {
      setProducts([]);
      return;
    }

    let cancelado = false;
    const timer = setTimeout(() => {
      api
        .get<Paginated<Product>>(`/products?search=${encodeURIComponent(query)}&pageSize=${MAX_SUGGESTIONS_SHOWN}${warehouseId ? `&warehouseId=${warehouseId}` : ''}`)
        // A trava de cancelamento evita que uma resposta lenta de uma busca
        // antiga sobrescreva o resultado de uma busca mais recente.
        .then((data) => {
          if (!cancelado) setProducts(data.items);
        })
        .catch(() => {
          if (!cancelado) setProducts([]);
        });
    }, 200);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [productQuery]);

  /**
   * Trocar o depósito reconta o carrinho.
   *
   * O saldo de cada linha é do depósito que estava escolhido na hora de
   * adicionar. Mudar o depósito sem recontar deixaria a tela mostrando o
   * estoque de um lugar enquanto a venda sai de outro — número errado com
   * cara de certo, que é pior que número nenhum.
   */
  useEffect(() => {
    if (!warehouseId) return;
    const ids = cartRef.current.map((l) => l.productId);
    if (ids.length === 0) return;

    let cancelado = false;
    Promise.all(
      ids.map((id) =>
        api
          .get<StockItem[]>(`/inventory/stock/products/${id}`)
          .then((itens) => [id, itens.find((i) => i.warehouse.id === warehouseId)?.quantity ?? 0] as const)
          // Falha de rede não pode inventar saldo: mantém o que já estava.
          .catch(() => null),
      ),
    ).then((pares) => {
      if (cancelado) return;
      const saldos = new Map(pares.filter((p): p is readonly [string, number] => p !== null));
      setCart((prev) => prev.map((l) => (saldos.has(l.productId) ? { ...l, estoque: saldos.get(l.productId)! } : l)));
    });

    return () => {
      cancelado = true;
    };
    // De propósito só warehouseId: adicionar item ao carrinho já traz o saldo
    // junto na resposta da busca, e refazer N chamadas a cada bipagem seria
    // desperdício no balcão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId]);

  // O cursor começa na busca: a primeira coisa que o operador faz ao abrir o
  // PDV é bipar ou digitar um produto.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const focus = (el: HTMLElement | null) => {
        e.preventDefault();
        el?.focus();
      };

      switch (e.key) {
        case 'F2':
          return focus(searchRef.current);
        case 'F3':
          // F3 é "localizar" no navegador; sem o preventDefault do focus(),
          // abriria a barra de busca por cima do PDV.
          return focus(customerRef.current);
        case 'F4':
          return focus(paymentRef.current);
        case 'F9':
          e.preventDefault();
          finalizeRef.current?.click();
          return;
        default:
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function finalizeSale(shouldConfirm: boolean) {
    setError(null);
    if (cart.length === 0) {
      setError('Adicione ao menos um produto.');
      return;
    }
    if (shouldConfirm && !paymentsMatch) {
      setError(
        canFiado
          ? `A soma dos pagamentos precisa fechar com o total — use a forma "Fiado" para o valor que ficará pendente.`
          : 'A soma dos pagamentos precisa ser igual ao total da venda (ou selecione um cliente para vender fiado).',
      );
      return;
    }
    setSaving(true);
    try {
      const realPayments = payments.filter((p) => p.method !== 'FIADO' && p.amount > 0);
      const sale = await api.post<Sale>('/sales', {
        customerId: customerId || undefined,
        warehouseId,
        items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
        payments:
          realPayments.length > 0
            ? realPayments.map((p) => ({ method: p.method as PaymentMethod, installments: p.installments, amount: grossAmount(p) }))
            : undefined,
        discount: Number(saleDiscount || 0),
        confirm: shouldConfirm,
        fiadoDays: fiadoLine?.days,
        cardFeeAmount: totalCardFee > 0 ? totalCardFee : undefined,
      });
      setSuccessId(sale.id);
      setCart([]);
      setPayments([{ method: 'CASH', installments: 1, amount: 0 }]);
      setSaleDiscount('0');
      setCustomerId('');
      setScanError(null);
      // Fecha o ciclo: terminou uma venda, o cursor já está pronto para o
      // primeiro item da próxima.
      searchRef.current?.focus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a venda.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">PDV — Venda rápida</h1>

      {/* Aviso, não bloqueio: a venda é registrada de qualquer forma. Mas sem
          caixa aberto ela não fica ligada a nenhuma gaveta, e no fim do dia
          não vai aparecer na conferência de ninguém. */}
      {cashSession === null && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <span>
            <strong>Caixa fechado.</strong> As vendas feitas agora não vão entrar na conferência do fim do dia.
          </span>
          <button onClick={() => router.push('/cash')} className="font-medium underline">
            Abrir caixa
          </button>
        </div>
      )}

      {cashSession && (
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Caixa aberto · dinheiro esperado na gaveta:{' '}
          <strong className="text-slate-700 dark:text-slate-200">
            {Number(cashSession.summary?.expectedAmount ?? 0).toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          </strong>
        </p>
      )}

      {successId && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <span>Venda salva com sucesso!</span>
          <div className="flex items-center gap-4">
            {/* Primeiro botão à direita é o cupom: no balcão, imprimir o
                comprovante é o passo seguinte imediato à venda. */}
            <a
              href={`/print/sale/${successId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline"
            >
              Imprimir cupom
            </a>
            <button onClick={() => router.push(`/sales/${successId}`)} className="font-medium underline">
              Ver venda
            </button>
          </div>
        </div>
      )}

      {/* Atalho que ninguém sabe que existe não é atalho. A legenda fica
          sempre visível, discreta, e é o que ensina o operador sem manual. */}
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
        {SHORTCUTS.map((s) => (
          <span key={s.key}>
            <kbd className="rounded border border-slate-300 px-1 py-0.5 font-mono text-[10px] text-slate-500 dark:border-slate-600 dark:text-slate-400">
              {s.key}
            </kbd>{' '}
            {s.label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select ref={customerRef} className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Cliente avulso</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="relative mb-4">
            <input
              ref={searchRef}
              className="input"
              placeholder="Bipe o código de barras ou busque por nome/SKU…"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              // O leitor de código de barras "digita" muito rápido; qualquer
              // correção automática do navegador atrapalharia a leitura.
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {scanError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
                {scanError}
              </p>
            )}
            {visibleProducts.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
                {visibleProducts.map((p, index) => (
                  <li key={p.id}>
                    <button
                      onClick={() => addToCart(p)}
                      // O mouse move o destaque para o item sob o cursor, para
                      // teclado e mouse nunca apontarem para itens diferentes.
                      onMouseEnter={() => setHighlight(index)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                        index === highlight ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>
                        <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{p.sku}</span> {p.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        {/* Saldo no depósito selecionado. Sem isto o operador
                            só descobria a falta ao tentar finalizar. */}
                        <EstoqueSelo quantidade={p.totalQuantity ?? 0} />
                        <span className="text-slate-500 dark:text-slate-400">R$ {Number(p.price).toFixed(2)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Produto</th>
                  <th className="px-3 py-2">Qtd</th>
                  <th className="px-3 py-2">Preço unit.</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {cart.map((line) => (
                  <tr key={line.productId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{line.sku}</span> {line.name}
                      <div className="mt-0.5">
                        <EstoqueSelo quantidade={line.estoque} pedido={line.quantity} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step={1}
                        min={1}
                        className={`input w-16 px-2 py-1 ${
                          line.quantity > line.estoque ? 'border-red-400 dark:border-red-500' : ''
                        }`}
                        value={line.quantity}
                        onChange={(e) => updateQuantity(line.productId, Number(e.target.value))}
                      />
                    </td>
                    <td className="px-3 py-2">R$ {line.unitPrice.toFixed(2)}</td>
                    <td className="px-3 py-2">R$ {(line.quantity * line.unitPrice).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeLine(line.productId)} className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400">
                        remover
                      </button>
                    </td>
                  </tr>
                ))}
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-400 dark:text-slate-500">
                      Carrinho vazio — busque um produto acima.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="mb-3 flex justify-between text-sm text-slate-600 dark:text-slate-300">
            <span>Subtotal</span>
            <span>R$ {subtotal.toFixed(2)}</span>
          </div>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Desconto (R$)</span>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={saleDiscount}
              onChange={(e) => setSaleDiscount(e.target.value)}
            />
          </label>
          <div className="mb-4 flex justify-between border-t border-slate-100 dark:border-slate-800 pt-3 text-base font-semibold">
            <span>Total</span>
            <span>R$ {total.toFixed(2)}</span>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Pagamento</span>
            <button onClick={addPaymentLine} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
              + adicionar forma
            </button>
          </div>
          <div className="space-y-2">
            {payments.map((p, i) => (
              <div key={i} className="flex gap-2">
                <select
                  className="input"
                  value={p.method}
                  onChange={(e) => {
                    const method = e.target.value as PosPaymentMethod;
                    if (method === 'FIADO') {
                      updatePayment(i, { method, amount: remaining + Number(p.amount || 0), days: selectedCustomer?.paymentTermDays ?? 30 });
                    } else if (method === 'CREDIT_CARD') {
                      const installments = p.installments || 1;
                      updatePayment(i, {
                        method,
                        installments,
                        amount: remaining + grossAmount(p),
                        cardFeePercent: cardFeeRates[installments - 1] ?? 0,
                      });
                    } else {
                      updatePayment(i, { method });
                    }
                  }}
                >
                  {Object.entries(PAYMENT_LABEL)
                    .filter(([value]) => value !== 'FIADO' || canFiado)
                    .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                </select>
                {p.method === 'CREDIT_CARD' && (
                  <select
                    className="input w-20"
                    value={p.installments}
                    onChange={(e) => {
                      const installments = Number(e.target.value);
                      updatePayment(i, { installments, cardFeePercent: cardFeeRates[installments - 1] ?? 0 });
                    }}
                  >
                    {INSTALLMENT_COUNTS.map((n) => (
                      <option key={n} value={n}>
                        {n}x
                      </option>
                    ))}
                  </select>
                )}
                {p.method === 'CREDIT_CARD' && (
                  <input
                    className="input w-16"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    title="Taxa da maquininha (%)"
                    placeholder="Taxa %"
                    value={p.cardFeePercent ?? 0}
                    onChange={(e) => updatePayment(i, { cardFeePercent: Number(e.target.value) })}
                  />
                )}
                {p.method === 'BOLETO' && (
                  <input
                    className="input w-20"
                    type="number"
                    step={1}
                    min={1}
                    placeholder="Parcelas"
                    value={p.installments}
                    onChange={(e) => updatePayment(i, { installments: Number(e.target.value) })}
                  />
                )}
                {p.method === 'FIADO' && (
                  <input
                    className="input w-20"
                    type="number"
                    step={1}
                    min={1}
                    max={365}
                    placeholder="Dias"
                    value={p.days ?? selectedCustomer?.paymentTermDays ?? 30}
                    onChange={(e) => updatePayment(i, { days: Math.max(1, Math.min(365, Number(e.target.value))) })}
                  />
                )}
                <input
                  // F4 leva o cursor para o valor da PRIMEIRA forma de
                  // pagamento, que é a que o operador preenche em quase toda
                  // venda; as demais linhas seguem no Tab.
                  ref={i === 0 ? paymentRef : undefined}
                  className="input w-28"
                  type="number"
                  min={0}
                  step="0.01"
                  title={p.method === 'CREDIT_CARD' ? 'Valor base (sem a taxa) — o valor cobrado no cartão é calculado ao lado' : undefined}
                  value={p.amount}
                  onChange={(e) => updatePayment(i, { amount: Number(e.target.value) })}
                />
                {payments.length > 1 && (
                  <button onClick={() => removePaymentLine(i)} className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400">
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className={`mt-2 text-xs ${paymentsMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            Pagamentos: R$ {paymentsSum.toFixed(2)} {paymentsMatch ? '✓ confere com o total' : `(faltam R$ ${remaining.toFixed(2)})`}
          </p>
          {fiadoLine && fiadoLine.amount > 0 && (
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
              R$ {Number(fiadoLine.amount).toFixed(2)} ficam como fiado, vencendo em {fiadoLine.days ?? selectedCustomer?.paymentTermDays} dias.
            </p>
          )}
          {payments
            .filter((p) => p.method === 'CREDIT_CARD' && p.amount > 0)
            .map((p, i) => (
              <p key={i} className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                {p.installments}x no cartão: R$ {grossAmount(p).toFixed(2)} cobrado (R${' '}
                {computeCardFeeAmount(Number(p.amount), p.cardFeePercent ?? 0).toFixed(2)} de taxa repassada, {(p.cardFeePercent ?? 0).toFixed(2)}%).
              </p>
            ))}
          {!paymentsMatch && !fiadoLine && canFiado && remaining > 0 && (
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
              Use a forma &quot;Fiado&quot; para deixar os R$ {remaining.toFixed(2)} restantes pendentes.
            </p>
          )}
          {!paymentsMatch && !canFiado && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Selecione um cliente cadastrado (não avulso) para vender fiado.
            </p>
          )}

          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            ref={finalizeRef}
            onClick={() => finalizeSale(true)}
            disabled={saving || cart.length === 0}
            className="mt-4 w-full rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Finalizar venda (F9)'}
          </button>
          <button
            onClick={() => finalizeSale(false)}
            disabled={saving || cart.length === 0}
            className="mt-2 w-full rounded-lg border border-slate-300 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            Salvar como orçamento
          </button>
        </div>
      </div>
    </div>
  );
}
