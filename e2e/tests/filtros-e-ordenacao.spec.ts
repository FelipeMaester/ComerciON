import type { Page } from '@playwright/test';
import { api, expect, test } from '../fixtures';

/**
 * Ordenar não pode mexer em filtro.
 *
 * Relatado pelo lojista, e reproduzido: clicar num cabeçalho para ordenar
 * remarcava sozinho o "Só estoque baixo", e a lista encolhia de volta. Vinha de
 * a ordenação ter sido pendurada no mesmo efeito que lê o endereço — e esse
 * efeito reescrevia o filtro a partir da URL a cada disparo. Quem chegava pelo
 * aviso de estoque baixo (`/products?estoque=baixo`), desmarcava para ver o
 * catálogo inteiro e clicava em "Preço" via o catálogo sumir sem ter pedido.
 */

/**
 * Clica em "Preço" e espera a lista voltar do servidor.
 *
 * A espera é o que dá sentido às asserções seguintes: o defeito remarcava o
 * filtro DEPOIS de a resposta chegar, então olhar antes é olhar para um estado
 * que ainda não foi corrompido — a primeira versão destes testes passava com o
 * defeito no lugar exatamente por isso. Aceita as duas rotas de propósito: com
 * o defeito, o pedido vai para /products/low-stock, e é isso que se quer pegar.
 */
/**
 * Conta as linhas da tabela depois que ela para de mudar.
 *
 * Contar direto é uma corrida: trocar o filtro dispara uma recarga, e durante
 * ela a tabela fica um instante sem nenhuma linha. Ler a contagem nesse
 * instante devolve zero e o teste falha acusando um defeito que não existe —
 * foi o que aconteceu, e só na suíte cheia, onde tudo corre mais devagar.
 */
async function contarLinhas(page: Page, minimo: number): Promise<number> {
  let quantas = 0;
  await expect(async () => {
    quantas = await page.locator('tbody tr').count();
    expect(quantas).toBeGreaterThan(minimo);
  }).toPass({ timeout: 15_000 });
  return quantas;
}

async function ordenarPorPreco(page: Page) {
  const resposta = page.waitForResponse((r) => /\/products(\?|\/low-stock)/.test(r.url()));
  await page.getByRole('columnheader', { name: 'Preço' }).getByRole('button').click();
  await resposta;
}

test.describe('filtros e ordenação não se atropelam', () => {
  /** Duas peças abastecidas e uma em falta, com preços distintos. */
  async function catalogo(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1]) {
    const depositos = await api(request, loja, 'get', '/warehouses');
    const deposito = depositos[0] ?? depositos.items?.[0];

    for (const [sku, nome, minimo, preco] of [
      ['ABAST-001', 'Peça abastecida A', 2, 100],
      ['ABAST-002', 'Peça abastecida B', 2, 300],
      ['FALTA-001', 'Peça em falta', 5, 200],
    ] as const) {
      await api(request, loja, 'post', '/products', { sku, name: nome, price: preco, costPrice: 40, minStock: minimo });
    }

    const produtos = await api(request, loja, 'get', '/products?pageSize=50');
    for (const produto of produtos.items) {
      // A que está em falta fica com saldo zero: é ela que sobra na lista curta.
      if (produto.sku === 'FALTA-001') continue;
      await api(request, loja, 'post', '/inventory/stock/adjust', {
        productId: produto.id,
        warehouseId: deposito.id,
        type: 'IN',
        quantity: 20,
        reason: 'Carga do teste',
      });
    }
  }

  test('desmarcar o filtro e ordenar não remarca o filtro', async ({ paginaLogada: page, request, loja }) => {
    await catalogo(request, loja);

    // Chega como quem clica no aviso de estoque baixo.
    await page.goto('/products?estoque=baixo');
    const filtro = page.getByRole('checkbox');
    await expect(filtro).toBeChecked();
    const curta = await page.locator('tbody tr').count();

    // Desmarca para ver o catálogo inteiro.
    await filtro.uncheck();
    await expect(filtro).not.toBeChecked();
    const inteiro = await contarLinhas(page, curta);

    await ordenarPorPreco(page);

    await expect(filtro, 'ordenar remarcou o filtro sozinho').not.toBeChecked();
    await expect(page.locator('tbody tr'), 'ordenar encolheu a lista de volta').toHaveCount(inteiro);
  });

  test('marcar o filtro e ordenar não desmarca o filtro', async ({ paginaLogada: page, request, loja }) => {
    await catalogo(request, loja);

    await page.goto('/products');
    const filtro = page.getByRole('checkbox');
    await filtro.check();
    await expect(filtro).toBeChecked();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const curta = await page.locator('tbody tr').count();

    await ordenarPorPreco(page);

    await expect(filtro, 'ordenar desmarcou o filtro').toBeChecked();
    await expect(page.locator('tbody tr')).toHaveCount(curta);
  });

  /**
   * O mesmo princípio na busca: ordenar não pode devolver a lista inteira para
   * quem acabou de procurar uma peça. O efeito antigo chamava
   * `load(undefined, …)`, jogando fora o termo digitado.
   */
  test('ordenar preserva a busca digitada', async ({ paginaLogada: page, request, loja }) => {
    await catalogo(request, loja);

    await page.goto('/products');
    await page.getByPlaceholder(/Buscar por nome/).fill('em falta');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);

    await ordenarPorPreco(page);

    await expect(page.locator('tbody tr'), 'ordenar descartou a busca').toHaveCount(1);
    await expect(page.locator('tbody tr').first()).toContainText('Peça em falta');
  });

  /**
   * A resposta que chega atrasada não pode desfazer o que o lojista pediu
   * depois.
   *
   * Cada pedido da lista termina em `setProducts(...)` sem ninguém conferir se
   * ainda é o pedido mais recente — vence quem chega por último, não quem foi
   * pedido por último. Em conexão ruim: abre Produtos, digita a peça, aperta
   * Buscar, vê o resultado certo, e um instante depois a lista inteira volta
   * por cima, com o termo ainda escrito no campo. A tela passa a contradizer
   * o próprio formulário.
   *
   * Aqui a primeira listagem fica presa de propósito e é solta depois que a
   * busca já respondeu — que é o cenário acima, sem depender de sorte.
   */
  test('resposta atrasada não desfaz a busca feita depois', async ({ paginaLogada: page, request, loja }) => {
    await catalogo(request, loja);

    const listagem = new RegExp('/api/products[?]');
    let primeira = true;
    let soltar = () => {};
    const presa = new Promise<void>((resolve) => {
      soltar = resolve;
    });

    await page.route(listagem, async (rota) => {
      if (primeira) {
        primeira = false;
        await presa;
      }
      await rota.continue();
    });

    await page.goto('/products');
    await page.getByPlaceholder(/Buscar por nome/).fill('em falta');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);

    // Agora a atrasada chega, trazendo o catálogo inteiro.
    const atrasada = page.waitForResponse((r) => listagem.test(r.url()));
    soltar();
    await atrasada;
    // Uma batida para o React renderizar o que não deveria renderizar.
    await page.waitForTimeout(500);

    await expect(page.locator('tbody tr'), 'a resposta atrasada desfez a busca').toHaveCount(1);
    await expect(page.locator('tbody tr').first()).toContainText('Peça em falta');
  });
});
