import { api, expect, test } from '../fixtures';

/**
 * A ficha do cliente antigo baixava a vida inteira dele.
 *
 * Medido com o cliente que toda auto peças tem — a oficina que compra três
 * vezes por semana há três anos: **922.204 bytes em 845 ms**, porque a ficha
 * trazia as 460 vendas com itens e pagamentos, os 120 orçamentos com itens e
 * produtos, e todas as oportunidades e tarefas.
 *
 * E essa é a tela que o balconista abre COM O CLIENTE esperando na frente
 * dele, para responder "o que ele levou da última vez" e "posso vender fiado
 * de novo". Depois: 23.758 bytes em 71 ms.
 *
 * O perigo desta correção não era o tamanho — era o saldo. Ele era somado em
 * memória sobre a lista de contas pendentes; pôr teto nessa lista faria a
 * dívida aparecer MENOR do que é, num número redondo e convincente.
 */
test.describe('ficha do cliente', () => {
  const COMPRAS = 12;
  const CONTAS = 25;

  async function clienteComHistorico(
    request: Parameters<typeof api>[0],
    loja: Parameters<typeof api>[1],
  ) {
    const cliente = await api(request, loja, 'post', '/customers', {
      type: 'COMPANY',
      name: 'Oficina do Zé',
      phone: '11966665555',
    });
    const produto = await api(request, loja, 'post', '/products', {
      sku: 'FICHA-001',
      name: 'Filtro de óleo',
      price: 40,
      costPrice: 20,
    });
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    await api(request, loja, 'post', '/inventory/stock/adjust', {
      productId: produto.id,
      warehouseId: deposito.id,
      type: 'IN',
      quantity: 500,
    });

    for (let i = 0; i < COMPRAS; i++) {
      const venda = await api(request, loja, 'post', '/sales', {
        customerId: cliente.id,
        warehouseId: deposito.id,
        items: [{ productId: produto.id, quantity: 1, unitPrice: 40 }],
      });
      await api(request, loja, 'post', `/sales/${venda.id}/confirm`, {
        payments: [{ method: 'CASH', amount: 40 }],
      });
    }

    // Mais contas pendentes que o teto da ficha: é aqui que uma soma feita
    // sobre a lista cortada mostraria dívida menor do que a real.
    let devido = 0;
    for (let i = 0; i < CONTAS; i++) {
      const valor = 100 + i;
      devido += valor;
      await api(request, loja, 'post', '/finance/entries', {
        type: 'RECEIVABLE',
        customerId: cliente.id,
        description: `Fiado ${i + 1}`,
        amount: valor,
        // As cinco primeiras já venceram.
        dueDate: new Date(Date.now() + (i < 5 ? -10 : 10) * 86400_000).toISOString().slice(0, 10),
      });
    }
    return { cliente, devido };
  }

  test('mostra as mais recentes e diz quantas existem', async ({ request, loja }) => {
    const { cliente } = await clienteComHistorico(request, loja);

    const ficha = await api(request, loja, 'get', `/customers/${cliente.id}/history`);

    expect(ficha.sales, 'a ficha traz um recorte, não a vida do cliente').toHaveLength(10);
    expect(ficha.totais.sales, 'e diz quantas existem de verdade').toBe(COMPRAS);
    // Sem o total, dez linhas passariam por "foi tudo o que ele comprou".
    expect(ficha.totais).toHaveProperty('quotes');
    expect(ficha.totais).toHaveProperty('opportunities');
    expect(ficha.totais).toHaveProperty('tasks');
  });

  /**
   * A asserção que impede o pior desfecho desta mudança.
   */
  test('a dívida é a do banco, não a das contas que couberam na tela', async ({ request, loja }) => {
    const { cliente, devido } = await clienteComHistorico(request, loja);

    const ficha = await api(request, loja, 'get', `/customers/${cliente.id}/history`);

    expect(ficha.outstandingBalance, `${CONTAS} contas somadas, não as 10 primeiras`).toBe(devido);
    // Se a soma voltasse a ser feita sobre uma lista com teto, este número
    // cairia para a soma das dez primeiras — e continuaria parecendo certo.
    const dezPrimeiras = Array.from({ length: 10 }, (_, i) => 100 + i).reduce((a, b) => a + b, 0);
    expect(ficha.outstandingBalance).not.toBe(dezPrimeiras);
    // Vencida é antes do começo de hoje: as cinco primeiras.
    expect(ficha.overdueBalance).toBe(100 + 101 + 102 + 103 + 104);
  });

  test('na tela, o recorte é dito e "ver todas" leva à lista daquele cliente', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    const { cliente } = await clienteComHistorico(request, loja);

    await page.goto(`/customers/${cliente.id}`);
    await expect(page.getByText(`Mostrando 10 de ${COMPRAS}.`)).toBeVisible();

    await page.getByRole('link', { name: 'Ver todas' }).click();
    await page.waitForURL(/\/sales\?customerId=/);

    // A lista filtrada tem de DIZER que está filtrada: sem isto, quem chega
    // aqui vê doze vendas e conclui que a loja vendeu doze vezes.
    await expect(page.getByText('Compras de Oficina do Zé')).toBeVisible();
    await expect(page.getByRole('link', { name: 'ver todas as vendas da loja' })).toBeVisible();
    // E são as compras DESTE cliente, não a lista da loja. (O contador de
    // páginas não aparece aqui: ele se esconde quando só há uma página.)
    await expect(page.locator('main tbody tr')).toHaveCount(COMPRAS);
    await expect(page.locator('main tbody')).toContainText('Oficina do Zé');
  });
});
