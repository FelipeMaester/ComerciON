import { test, expect, api, API_URL, type Loja } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';

/**
 * Duas pessoas clicando no mesmo botão ao mesmo tempo.
 *
 * Todo o sistema fazia a mesma coisa: lia o estado, conferia em JavaScript e
 * gravava. No isolamento padrão do Postgres, as duas leem o estado antigo, as
 * duas passam pela conferência e as duas executam os efeitos. Medido antes da
 * correção:
 *
 *   - confirmar 5x a mesma venda de R$ 200: 5 aceitas, 10 unidades baixadas em
 *     vez de 2, R$ 1.000 de pagamento e 5 contas a receber
 *   - devolver 5x a mesma venda de 4 unidades: estoque 6 → 26
 *   - 6 vendas com um cupom `usageLimit: 1`: as 6 com desconto
 *   - abrir caixa 3x: dois caixas abertos ao mesmo tempo
 *
 * Como no arquivo de estoque, o que estes testes travam é a regra de negócio,
 * não o código HTTP: um clique repetido não pode virar dinheiro ou peça a mais.
 */

function cabecalhos(loja: Loja) {
  return { Authorization: `Bearer ${loja.accessToken}`, 'x-tenant-slug': loja.slug };
}

async function produtoComEstoque(request: APIRequestContext, loja: Loja, depositoId: string, quantidade: number) {
  const produto = await api(request, loja, 'post', '/products', {
    sku: `EST-${Math.random().toString(36).slice(2, 9)}`,
    name: 'Peça',
    price: 100,
    costPrice: 50,
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

async function saldo(request: APIRequestContext, loja: Loja, produtoId: string) {
  const itens = await api(request, loja, 'get', `/inventory/stock/products/${produtoId}`);
  return (itens as Array<{ quantity: number }>).reduce((soma, i) => soma + Number(i.quantity), 0);
}

/** Dispara a mesma chamada N vezes de uma vez e conta quantas foram aceitas. */
async function aoMesmoTempo(vezes: number, chamada: () => Promise<{ ok(): boolean }>) {
  const respostas = await Promise.all(Array.from({ length: vezes }, chamada));
  return respostas.filter((r) => r.ok()).length;
}

test.describe('mesmo clique, várias vezes', () => {
  test('confirmar a mesma venda cinco vezes baixa o estoque uma vez só', async ({ request, loja }) => {
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    const produtoId = await produtoComEstoque(request, loja, deposito.id, 20);
    const venda = await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      items: [{ productId: produtoId, quantity: 2, unitPrice: 100 }],
      confirm: false,
    });

    const aceitas = await aoMesmoTempo(5, () =>
      request.post(`${API_URL}/api/sales/${venda.id}/confirm`, {
        headers: cabecalhos(loja),
        data: { payments: [{ method: 'CASH', amount: 200 }] },
      }),
    );

    expect(aceitas, 'só uma confirmação pode valer').toBe(1);
    expect(await saldo(request, loja, produtoId), 'a venda é de 2 unidades').toBe(18);

    const confirmada = await api(request, loja, 'get', `/sales/${venda.id}`);
    const pago = (confirmada.payments as Array<{ amount: string }>).reduce((s, p) => s + Number(p.amount), 0);
    expect(pago, 'R$ 200 de venda não pode virar R$ 1.000 de pagamento').toBe(200);

    const lancamentos = await api(request, loja, 'get', '/finance/entries');
    const daVenda = (Array.isArray(lancamentos) ? lancamentos : lancamentos.data).filter(
      (l: { saleId?: string }) => l.saleId === venda.id,
    );
    expect(daVenda, 'uma venda, uma conta a receber').toHaveLength(1);
  });

  test('devolver a mesma venda cinco vezes repõe o estoque uma vez só', async ({ request, loja }) => {
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    const produtoId = await produtoComEstoque(request, loja, deposito.id, 10);
    const venda = await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      items: [{ productId: produtoId, quantity: 4, unitPrice: 100 }],
      payments: [{ method: 'CASH', amount: 400 }],
      confirm: true,
    });

    const aceitas = await aoMesmoTempo(5, () =>
      request.post(`${API_URL}/api/sales/${venda.id}/return`, { headers: cabecalhos(loja), data: {} }),
    );

    expect(aceitas).toBe(1);
    expect(await saldo(request, loja, produtoId), 'devolver não pode criar peça do nada').toBe(10);
  });

  test('cupom de uso único dá desconto uma vez, mesmo com seis vendas simultâneas', async ({ request, loja }) => {
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    const produtoId = await produtoComEstoque(request, loja, deposito.id, 100);
    const codigo = `UNI${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    await api(request, loja, 'post', '/coupons', {
      code: codigo,
      discountType: 'PERCENTAGE',
      value: 50,
      usageLimit: 1,
    });

    const respostas = await Promise.all(
      Array.from({ length: 6 }, () =>
        request.post(`${API_URL}/api/sales`, {
          headers: cabecalhos(loja),
          data: {
            warehouseId: deposito.id,
            items: [{ productId: produtoId, quantity: 1, unitPrice: 200 }],
            couponCode: codigo,
            payments: [{ method: 'CASH', amount: 100 }],
            confirm: true,
          },
        }),
      ),
    );

    const comDesconto = [];
    for (const r of respostas) {
      if (!r.ok()) continue;
      const venda = await r.json();
      if (Number(venda.total) < 200) comDesconto.push(venda);
    }
    expect(comDesconto, 'um cupom de uso único não pode virar seis descontos').toHaveLength(1);

    const cupons = await api(request, loja, 'get', '/coupons');
    const cupom = (cupons as Array<{ code: string; usedCount: number; usageLimit: number }>).find((c) => c.code === codigo);
    expect(cupom?.usedCount).toBeLessThanOrEqual(cupom!.usageLimit);
  });

  test('três aberturas de caixa simultâneas deixam um caixa aberto', async ({ request, loja }) => {
    const aceitas = await aoMesmoTempo(3, () =>
      request.post(`${API_URL}/api/cash/open`, { headers: cabecalhos(loja), data: { openingAmount: 100 } }),
    );

    expect(aceitas, 'dois caixas abertos tornam a conferência de fechamento sem sentido').toBe(1);

    const sessoes = await api(request, loja, 'get', '/cash/sessions');
    const abertas = (Array.isArray(sessoes) ? sessoes : sessoes.data).filter(
      (s: { status: string }) => s.status === 'OPEN',
    );
    expect(abertas).toHaveLength(1);
  });

  test('concluir a mesma ordem de serviço quatro vezes gera uma venda só', async ({ request, loja }) => {
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    const produtoId = await produtoComEstoque(request, loja, deposito.id, 20);
    const cliente = await api(request, loja, 'post', '/customers', {
      type: 'INDIVIDUAL',
      name: 'Cliente da OS',
      phone: '11955554444',
    });
    const orcamento = await api(request, loja, 'post', '/quotes', {
      customerId: cliente.id,
      items: [{ productId: produtoId, description: 'Troca de peça', quantity: 2, unitPrice: 300 }],
    });
    await api(request, loja, 'post', `/quotes/${orcamento.id}/approve`, {});
    const [ordem] = await api(request, loja, 'get', '/service-orders');

    await aoMesmoTempo(4, () =>
      request.patch(`${API_URL}/api/service-orders/${ordem.id}/status`, {
        headers: cabecalhos(loja),
        data: { status: 'DONE' },
      }),
    );

    // Medido antes da correção: 4 vendas, R$ 2.400 a receber por um serviço de
    // R$ 600, e 8 unidades baixadas em vez de 2. O `saleId @unique` não segura
    // isso — são quatro saleId diferentes, cada um único.
    const vendas = await api(request, loja, 'get', '/sales');
    expect(vendas.items, 'um serviço concluído, uma venda').toHaveLength(1);
    expect(Number(vendas.items[0].total)).toBe(600);
    expect(await saldo(request, loja, produtoId), 'a OS consome 2 peças, não 8').toBe(18);

    const lancamentos = await api(request, loja, 'get', '/finance/entries');
    expect(Array.isArray(lancamentos) ? lancamentos : lancamentos.items).toHaveLength(1);
  });

  test('aprovar e recusar o mesmo orçamento ao mesmo tempo não deixa serviço aberto num recusado', async ({
    request,
    loja,
  }) => {
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    const produtoId = await produtoComEstoque(request, loja, deposito.id, 10);
    const cliente = await api(request, loja, 'post', '/customers', {
      type: 'INDIVIDUAL',
      name: 'Cliente indeciso',
      phone: '11933332222',
    });
    const orcamento = await api(request, loja, 'post', '/quotes', {
      customerId: cliente.id,
      items: [{ productId: produtoId, description: 'Serviço', quantity: 1, unitPrice: 120 }],
    });

    const token = orcamento.publicToken;
    await Promise.all([
      request.post(`${API_URL}/api/public/quotes/${token}/approve`, { data: {} }),
      request.post(`${API_URL}/api/public/quotes/${token}/reject`, { data: {} }),
    ]);

    const final = await api(request, loja, 'get', `/quotes/${orcamento.id}`);
    const ordens = await api(request, loja, 'get', '/service-orders');

    // O que não pode: recusado com ordem de serviço aberta — a oficina
    // executando um serviço que o cliente recusou. Medido, era o que dava.
    expect(['APPROVED', 'REJECTED']).toContain(final.status);
    expect(ordens.length, `orçamento ${final.status} tem de casar com a ordem de serviço`).toBe(
      final.status === 'APPROVED' ? 1 : 0,
    );
  });

  test('finalizar a mesma contagem de estoque quatro vezes lança um ajuste só', async ({ request, loja }) => {
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    const produtoId = await produtoComEstoque(request, loja, deposito.id, 10);
    const contagem = await api(request, loja, 'post', '/inventory/stock-counts', { warehouseId: deposito.id });
    const item = contagem.items.find((i: { productId: string }) => i.productId === produtoId);
    await api(request, loja, 'patch', `/inventory/stock-counts/${contagem.id}/items/${item.id}`, { countedQty: 7 });

    const aceitas = await aoMesmoTempo(4, () =>
      request.post(`${API_URL}/api/inventory/stock-counts/${contagem.id}/complete`, {
        headers: cabecalhos(loja),
        data: {},
      }),
    );

    expect(aceitas).toBe(1);
    expect(await saldo(request, loja, produtoId), 'o saldo vira o valor contado').toBe(7);

    // O saldo ficava certo mesmo com o defeito (ADJUSTMENT é valor absoluto);
    // o que quebrava era o histórico, com quatro correções que não existiram.
    const movimentos = await api(request, loja, 'get', `/inventory/stock/products/${produtoId}/movements`);
    const ajustes = (movimentos as Array<{ type: string }>).filter((m) => m.type === 'ADJUSTMENT');
    expect(ajustes, 'uma contagem, um ajuste no histórico').toHaveLength(1);
  });

  test('dar baixa quatro vezes na mesma conta só vale uma', async ({ request, loja }) => {
    const conta = await api(request, loja, 'post', '/finance/entries', {
      type: 'RECEIVABLE',
      description: 'Conta do teste de concorrência',
      amount: 500,
      dueDate: new Date().toISOString(),
    });

    const aceitas = await aoMesmoTempo(4, () =>
      request.patch(`${API_URL}/api/finance/entries/${conta.id}/pay`, { headers: cabecalhos(loja) }),
    );

    expect(aceitas).toBe(1);
    expect((await api(request, loja, 'get', `/finance/entries/${conta.id}`)).status).toBe('PAID');
  });
});
