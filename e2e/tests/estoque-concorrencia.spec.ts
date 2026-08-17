import { test, expect, api, API_URL, type Loja } from '../fixtures';
import type { APIRequestContext } from '@playwright/test';

/**
 * Duas pessoas vendendo a última peça ao mesmo tempo.
 *
 * Este arquivo existe por causa de um defeito medido: o saldo era lido em
 * JavaScript, a nova quantidade calculada na memória e gravada de volta. No
 * isolamento padrão do Postgres (Read Committed) as duas transações liam
 * `1`, as duas calculavam `0` e as duas gravavam `0` — as duas vendas
 * passavam. Cinco vendas simultâneas da última unidade: cinco aceitas,
 * estoque final zero. A loja vendia peça que não tinha.
 *
 * Nenhum teste unitário pega isso, porque não existe concorrência com um
 * Prisma mockado. Só disparando requisições de verdade contra o banco de
 * verdade. Por isso mora aqui e não em `stock.service.spec.ts`.
 *
 * O que estes testes travam não é a mensagem de erro nem o código HTTP — é a
 * regra que não pode quebrar nunca: **unidades não se criam nem somem**.
 * Vendido + em estoque tem de bater com o que entrou.
 *
 * Conferido revertendo a correção: 4 dos 5 falham sem ela. O que sobrevive é
 * justamente o primeiro — cinco requisições podem se enfileirar por acaso e
 * dar o resultado certo mesmo com o defeito no lugar. Ele está aqui porque é
 * o caso em português claro; quem tem dente de verdade são os de conservação,
 * com trinta disputas simultâneas.
 */

/** Venda confirmada em uma tacada, do jeito que o PDV faz. */
function venda(request: APIRequestContext, loja: Loja, produtoId: string, depositoId: string, quantidade: number) {
  return request.post(`${API_URL}/api/sales`, {
    headers: { Authorization: `Bearer ${loja.accessToken}`, 'x-tenant-slug': loja.slug },
    data: {
      warehouseId: depositoId,
      items: [{ productId: produtoId, quantity: quantidade, unitPrice: 100 }],
      payments: [{ method: 'CASH', amount: 100 * quantidade }],
      confirm: true,
    },
  });
}

async function saldoTotal(request: APIRequestContext, loja: Loja, produtoId: string) {
  const itens = await api(request, loja, 'get', `/inventory/stock/products/${produtoId}`);
  return (itens as Array<{ quantity: number }>).reduce((soma, item) => soma + Number(item.quantity), 0);
}

async function produtoComEstoque(request: APIRequestContext, loja: Loja, depositoId: string, quantidade: number) {
  const produto = await api(request, loja, 'post', '/products', {
    sku: `CONC-${Math.random().toString(36).slice(2, 9)}`,
    name: 'Peça disputada',
    price: 100,
    costPrice: 50,
  });
  if (quantidade > 0) {
    await api(request, loja, 'post', '/inventory/stock/adjust', {
      productId: produto.id,
      warehouseId: depositoId,
      type: 'IN',
      quantity: quantidade,
      reason: 'carga do teste',
    });
  }
  return produto.id as string;
}

test.describe('estoque sob concorrência', () => {
  test('cinco vendas simultâneas da última unidade: só uma pode passar', async ({ request, loja }) => {
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    const produtoId = await produtoComEstoque(request, loja, deposito.id, 1);

    const respostas = await Promise.all(Array.from({ length: 5 }, () => venda(request, loja, produtoId, deposito.id, 1)));
    const aceitas = respostas.filter((r) => r.ok()).length;

    expect(aceitas, 'a mesma unidade não pode ser vendida duas vezes').toBe(1);
    expect(await saldoTotal(request, loja, produtoId)).toBe(0);
  });

  test('trinta pedidos de 2 unidades sobre um saldo de 25: nada se cria nem some', async ({ request, loja }) => {
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    const produtoId = await produtoComEstoque(request, loja, deposito.id, 25);

    const respostas = await Promise.all(Array.from({ length: 30 }, () => venda(request, loja, produtoId, deposito.id, 2)));
    const aceitas = respostas.filter((r) => r.ok()).length;
    const sobra = await saldoTotal(request, loja, produtoId);

    // O ponto não é quantas passam (12 é o teto), é a conta fechar.
    expect(aceitas * 2 + sobra, 'vendido + em estoque tem de bater com o que entrou').toBe(25);
    expect(aceitas).toBeLessThanOrEqual(12);
    expect(sobra).toBeGreaterThanOrEqual(0);
  });

  test('primeira entrada simultânea de um produto sem saldo não perde unidade nem quebra', async ({ request, loja }) => {
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    // Sem carga inicial: a linha de saldo ainda não existe, e oito entradas
    // ao mesmo tempo disputam a criação dela.
    const produtoId = await produtoComEstoque(request, loja, deposito.id, 0);

    const respostas = await Promise.all(
      Array.from({ length: 8 }, () =>
        request.post(`${API_URL}/api/inventory/stock/adjust`, {
          headers: { Authorization: `Bearer ${loja.accessToken}`, 'x-tenant-slug': loja.slug },
          data: { productId: produtoId, warehouseId: deposito.id, type: 'IN', quantity: 5, reason: 'entrada simultânea' },
        }),
      ),
    );

    expect(respostas.filter((r) => r.status() >= 500), 'nenhuma entrada pode estourar no servidor').toHaveLength(0);
    expect(respostas.every((r) => r.ok()), 'toda entrada deveria ser aceita').toBeTruthy();
    expect(await saldoTotal(request, loja, produtoId)).toBe(40);
  });

  test('transferências simultâneas não duplicam nem evaporam estoque', async ({ request, loja }) => {
    const [origem] = await api(request, loja, 'get', '/warehouses');
    const destino = await api(request, loja, 'post', '/warehouses', { name: `Depósito 2 ${Date.now()}` });
    const produtoId = await produtoComEstoque(request, loja, origem.id, 10);

    const respostas = await Promise.all(
      Array.from({ length: 12 }, () =>
        request.post(`${API_URL}/api/inventory/stock/transfer`, {
          headers: { Authorization: `Bearer ${loja.accessToken}`, 'x-tenant-slug': loja.slug },
          data: { productId: produtoId, sourceWarehouseId: origem.id, destWarehouseId: destino.id, quantity: 1 },
        }),
      ),
    );
    const aceitas = respostas.filter((r) => r.ok()).length;

    expect(aceitas, 'não dá para transferir mais do que existe na origem').toBeLessThanOrEqual(10);
    expect(await saldoTotal(request, loja, produtoId), 'a soma dos dois depósitos tem de continuar 10').toBe(10);
  });

  test('a movimentação registra o saldo que o banco confirmou', async ({ request, loja }) => {
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    const produtoId = await produtoComEstoque(request, loja, deposito.id, 6);

    await Promise.all(Array.from({ length: 6 }, () => venda(request, loja, produtoId, deposito.id, 1)));

    // O histórico é o que o dono da loja audita: cada linha tem de encaixar
    // na seguinte, sem buraco nem valor repetido por leitura velha.
    const movimentos = (await api(request, loja, 'get', `/inventory/stock/products/${produtoId}/movements`)) as Array<{
      type: string;
      quantity: number;
      previousQuantity: number;
      newQuantity: number;
    }>;

    for (const mov of movimentos) {
      const esperado = mov.type === 'IN' ? mov.previousQuantity + mov.quantity : mov.previousQuantity - mov.quantity;
      expect(esperado, `movimentação ${mov.type} de ${mov.quantity} não fecha`).toBe(mov.newQuantity);
    }

    const saidas = movimentos.filter((m) => m.type === 'OUT');
    const saldosFinais = saidas.map((m) => m.newQuantity).sort((a, b) => a - b);
    expect(new Set(saldosFinais).size, 'duas saídas não podem ter deixado o mesmo saldo').toBe(saidas.length);
    expect(await saldoTotal(request, loja, produtoId)).toBe(0);
  });
});
