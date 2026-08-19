import { api, expect, test } from '../fixtures';

/**
 * O caminho do fiado, de ponta a ponta.
 *
 * O fiado já virava conta a receber, mas o sistema parava aí: a venda dizia
 * "Pagamento pendente" sem dizer quanto nem para quando, o sino só falava do
 * que JÁ tinha vencido — quando o lembrete não evita mais nada — e a única
 * automação de cobrança era corretiva.
 */
test.describe('fiado', () => {
  /** Cria uma venda com parte (ou tudo) em fiado, vencendo em N dias. */
  async function venderFiado(
    request: Parameters<typeof api>[0],
    loja: Parameters<typeof api>[1],
    opcoes: { dias: number; pago?: number },
  ) {
    const deposito = (await api(request, loja, 'get', '/warehouses'))[0];
    const cliente = await api(request, loja, 'post', '/customers', {
      type: 'INDIVIDUAL',
      name: 'Cliente do fiado',
      phone: '14999990000',
    });
    const produto = await api(request, loja, 'post', '/products', {
      sku: `FIA-${opcoes.dias}`,
      name: 'Bateria 60Ah',
      price: 500,
      costPrice: 300,
    });
    await api(request, loja, 'post', '/inventory/stock/adjust', {
      productId: produto.id,
      warehouseId: deposito.id,
      type: 'IN',
      quantity: 5,
      reason: 'teste',
    });

    const venda = await api(request, loja, 'post', '/sales', {
      warehouseId: deposito.id,
      customerId: cliente.id,
      items: [{ productId: produto.id, quantity: 1 }],
      payments: opcoes.pago ? [{ method: 'CASH', amount: opcoes.pago }] : [],
      fiadoDays: opcoes.dias,
      confirm: true,
    });
    return { venda, cliente };
  }

  test('a venda mostra quanto falta e quantos dias faltam', async ({ paginaLogada: page, request, loja }) => {
    // R$ 200 pagos à vista, R$ 300 no fiado para 10 dias.
    const { venda } = await venderFiado(request, loja, { dias: 10, pago: 200 });

    await page.goto(`/sales/${venda.id}`);

    const emAberto = page.getByRole('heading', { name: 'Em aberto' });
    await expect(emAberto).toBeVisible();

    // O valor que ficou e — o que faltava — o prazo em palavras.
    await expect(page.getByText('R$ 300,00').first()).toBeVisible();
    await expect(page.getByText('faltam 10 dias')).toBeVisible();
  });

  test('quando o vencimento se aproxima, o prazo muda de tom', async ({ paginaLogada: page, request, loja }) => {
    const { venda } = await venderFiado(request, loja, { dias: 2 });

    await page.goto(`/sales/${venda.id}`);
    await expect(page.getByText('faltam 2 dias')).toBeVisible();

    // Dentro da janela de aviso, o prazo sai destacado — é o que diferencia
    // "para o mês que vem" de "é essa semana".
    const prazo = page.getByText('faltam 2 dias');
    await expect(prazo).toHaveClass(/amber/);
  });

  test('o sino avisa 3 dias antes e leva à lista do que está por vencer', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    await venderFiado(request, loja, { dias: 2 });

    await page.goto('/dashboard');
    await page.getByRole('button', { name: /avisos/i }).click();

    const aviso = page.getByRole('link', { name: /vence nos próximos 3 dias/i });
    await expect(aviso).toBeVisible();
    await aviso.click();

    await expect(page).toHaveURL(/situacao=a-vencer/);
    await expect(page.getByText('Vencendo nos próximos 3 dias')).toBeVisible();
    // A lista mostra a conta com o prazo, não só a data.
    await expect(page.getByText('faltam 2 dias').first()).toBeVisible();
  });

  test('o que vence longe não entra no aviso — senão o sino vira ruído', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    await venderFiado(request, loja, { dias: 30 });

    await page.goto('/dashboard');
    await page.getByRole('button', { name: /avisos/i }).click();
    await expect(page.getByRole('link', { name: /vence nos próximos 3 dias/i })).toHaveCount(0);
  });

  test('dá para montar a cobrança preventiva sem sair da tela de Automações', async ({
    paginaLogada: page,
  }) => {
    await page.goto('/automations');
    await page.getByRole('button', { name: /nova automação/i }).click();

    // O gatilho precisa estar OFERECIDO na tela. Enquanto só existisse no
    // banco, a automação preventiva seria um recurso que ninguém acha.
    const gatilho = page.getByLabel(/quando/i).first();
    await gatilho.selectOption({ label: 'Conta a receber vencendo em X dias' });

    // E o campo de dias precisa vir junto, com o padrão que o sino usa.
    const dias = page.getByLabel(/dias antes do vencimento/i);
    await expect(dias).toBeVisible();
    await expect(dias).toHaveValue('3');
  });
});
