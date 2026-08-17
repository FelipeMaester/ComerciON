import { test, expect, api, type Loja } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';

/**
 * Os números que o dono da loja usa para decidir.
 *
 * Dois defeitos medidos aqui, ambos silenciosos — não davam erro, davam o
 * número errado com cara de certo:
 *
 *   1. Venda devolvida continuava valendo no Financeiro. A peça voltava, o
 *      estoque voltava, o Dashboard já não contava a venda — mas o lançamento
 *      nascido PAID (venda à vista) sobrevivia ao cancelamento, que só pegava
 *      os PENDING. Financeiro dizia R$ 1.100, Dashboard dizia R$ 600.
 *   2. O fluxo de caixa cortava o último dia do período: "de hoje até hoje"
 *      devolvia R$ 0,00 num dia com vendas, porque `to` virava meia-noite.
 */

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function produtoComEstoque(request: APIRequestContext, loja: Loja, depositoId: string, quantidade: number) {
  const produto = await api(request, loja, 'post', '/products', {
    sku: `FIN-${Math.random().toString(36).slice(2, 9)}`,
    name: 'Peça',
    price: 100,
    costPrice: 40,
  });
  await api(request, loja, 'post', '/inventory/stock/adjust', {
    productId: produto.id,
    warehouseId: depositoId,
    type: 'IN',
    quantity: quantidade,
    reason: 'carga do teste',
  });
  return produto.id as string;
}

const lancamentos = (resposta: unknown) =>
  (Array.isArray(resposta) ? resposta : (resposta as { items: unknown[] }).items) as {
    saleId?: string;
    type: string;
    status: string;
    amount: string;
  }[];

test.describe('números do financeiro', () => {
  test('venda devolvida não fica valendo no caixa da loja', async ({ request, loja }) => {
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    const produtoId = await produtoComEstoque(request, loja, deposito.id, 20);

    // Uma venda que fica e uma que volta — as duas pagas à vista, que é o
    // caminho onde o lançamento nasce PAID.
    await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      items: [{ productId: produtoId, quantity: 2, unitPrice: 100 }],
      payments: [{ method: 'CASH', amount: 200 }],
      confirm: true,
    });
    const devolvida = await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      items: [{ productId: produtoId, quantity: 5, unitPrice: 100 }],
      payments: [{ method: 'CASH', amount: 500 }],
      confirm: true,
    });
    await api(request, loja, 'post', `/sales/${devolvida.id}/return`, {});

    const daVenda = lancamentos(await api(request, loja, 'get', '/finance/entries')).filter(
      (l) => l.saleId === devolvida.id && l.status !== 'CANCELED',
    );
    const saldo = daVenda.reduce((s, l) => s + (l.type === 'RECEIVABLE' ? Number(l.amount) : -Number(l.amount)), 0);

    expect(saldo, 'entrada e devolução têm de se anular').toBe(0);
    // E as duas pontas ficam visíveis: apagar a entrada seria mentir na outra
    // direção — o dinheiro entrou de verdade antes de voltar.
    expect(daVenda.some((l) => l.type === 'RECEIVABLE'), 'a entrada continua no histórico').toBeTruthy();
    expect(daVenda.some((l) => l.type === 'PAYABLE'), 'a devolução tem de aparecer').toBeTruthy();

    // O Dashboard já filtrava por status da venda; agora os dois concordam.
    const painel = await api(request, loja, 'get', '/reports/dashboard');
    expect(Number(painel.today.total), 'só a venda que ficou').toBe(200);
  });

  test('"de hoje até hoje" mostra o que foi pago hoje', async ({ request, loja }) => {
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    const produtoId = await produtoComEstoque(request, loja, deposito.id, 10);
    await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      items: [{ productId: produtoId, quantity: 3, unitPrice: 100 }],
      payments: [{ method: 'CASH', amount: 300 }],
      confirm: true,
    });

    const dia = hoje();
    const fluxo = await api(request, loja, 'get', `/finance/cashflow?from=${dia}&to=${dia}`);

    // Com `to` em meia-noite, isto era R$ 0,00 — um dia inteiro de vendas
    // sumia do relatório sem nenhum erro na tela.
    expect(Number(fluxo.realizado.receitas)).toBe(300);
  });

  test('data inválida no período é recusada com 400, não com 500', async ({ request, loja }) => {
    for (const query of ['', '?from=&to=', '?from=banana&to=abacaxi', '?from=2026-02-31&to=2026-03-01']) {
      const resposta = await request.get(`${process.env.E2E_API_URL ?? 'http://localhost:3001'}/api/finance/cashflow${query}`, {
        headers: { Authorization: `Bearer ${loja.accessToken}`, 'x-tenant-slug': loja.slug },
      });
      expect(resposta.status(), `"${query || '(sem parâmetro)'}" não pode ser erro de servidor`).toBe(400);
    }
  });
});
