import { api, expect, test } from '../fixtures';

/**
 * A loja escolhe como a própria marca aparece — e a escolha tem que valer em
 * todos os lugares, não só no menu.
 *
 * O que estes testes protegem: a logo era carregada em UM lugar (o menu do
 * painel) e não aparecia no cupom que o cliente leva do balcão nem na ordem de
 * serviço que ele assina, mesmo com a página do cupom já buscando os dados da
 * loja. Type-check e testes unitários não têm como pegar isso: o campo estava
 * lá, só não era usado.
 */

// PNG 4x4 vermelho. Pequeno de propósito: o que se mede é se a imagem chega na
// tela, não o conteúdo dela.
const LOGO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR4nGP8z8DAwMDAxIAAaHwGBgYAJcYCbwAAAABJRU5ErkJggg==';

/**
 * CNPJ válido e diferente a cada execução.
 *
 * Não dá para fixar um CNPJ no teste: a coluna `document` é única no banco
 * INTEIRO, não por loja, então o segundo run bateria em 409. E não dá para
 * sortear 14 dígitos quaisquer: o back valida os dígitos verificadores.
 */
function cnpjValido(): string {
  const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const digito = (pesos: number[]) => {
    const soma = pesos.reduce((total, peso, i) => total + peso * base[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  base.push(digito([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  base.push(digito([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  return base.join('');
}

/** Cria uma venda confirmada e devolve o id, para abrir o cupom dela. */
async function venderAlgo(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1]) {
  const produto = await api(request, loja, 'post', '/products', {
    sku: 'ID-001',
    name: 'Peça da Identidade',
    price: 50,
    costPrice: 20,
  });
  const depositos = await api(request, loja, 'get', '/warehouses');
  const deposito = depositos[0] ?? depositos.items[0];
  await api(request, loja, 'post', '/inventory/stock/adjust', {
    productId: produto.id,
    warehouseId: deposito.id,
    type: 'IN',
    quantity: 5,
    reason: 'Carga do teste',
  });
  const venda = await api(request, loja, 'post', '/sales', {
    warehouseId: deposito.id,
    items: [{ productId: produto.id, quantity: 1 }],
    payments: [{ method: 'CASH', amount: 50 }],
    confirm: true,
  });
  return venda.id as string;
}

test.describe('identidade da loja', () => {
  test('o menu obedece a escolha das três formas', async ({ paginaLogada: page, request, loja }) => {
    const menu = page.locator('aside');

    // 1. Padrão de quem acabou de se cadastrar: sem logo, iniciais e nome.
    await page.goto('/dashboard');
    await expect(menu.getByText(loja.nome)).toBeVisible();
    await expect(menu.locator('img'), 'sem logo enviada não deve haver imagem no menu').toHaveCount(0);

    // 2. Com logo, no padrão: a imagem entra e o nome fica.
    await api(request, loja, 'patch', '/settings', { logoUrl: LOGO });
    await page.goto('/dashboard');
    await expect(menu.locator('img')).toHaveCount(1);
    await expect(menu.getByText(loja.nome)).toBeVisible();

    // 3. Só a logo: a imagem cresce e o nome sai de perto dela. É o caso de
    //    logotipo que já traz o nome escrito dentro.
    await api(request, loja, 'patch', '/settings', { brandDisplay: 'logo' });
    await page.goto('/dashboard');
    await expect(menu.locator('img')).toHaveCount(1);
    await expect(menu.getByText(loja.nome), 'no modo "só a logo" o nome não se repete').toHaveCount(0);

    // 4. Só o nome: nenhuma imagem, nem a logo enviada.
    await api(request, loja, 'patch', '/settings', { brandDisplay: 'nome' });
    await page.goto('/dashboard');
    await expect(menu.locator('img')).toHaveCount(0);
    await expect(menu.getByText(loja.nome)).toBeVisible();
  });

  test('a logo sai no cupom da venda', async ({ paginaLogada: page, request, loja }) => {
    const vendaId = await venderAlgo(request, loja);

    // Sem logo: o cupom mostra o nome, como sempre mostrou.
    await page.goto(`/print/sale/${vendaId}`);
    await expect(page.getByText(loja.nome)).toBeVisible();
    await expect(page.locator('.print-page img')).toHaveCount(0);

    // Com logo: ela entra no cabeçalho do cupom.
    await api(request, loja, 'patch', '/settings', { logoUrl: LOGO });
    await page.goto(`/print/sale/${vendaId}`);
    await expect(page.locator('.print-page img')).toHaveCount(1);
    await expect(page.getByText(loja.nome)).toBeVisible();

    // Só a logo: o nome sai do papel, mas o CNPJ fica — é ele que identifica
    // quem emitiu o comprovante para quem recebeu.
    await api(request, loja, 'patch', '/settings', { brandDisplay: 'logo', document: cnpjValido() });
    await page.goto(`/print/sale/${vendaId}`);
    await expect(page.locator('.print-page img')).toHaveCount(1);
    await expect(page.getByText(loja.nome)).toHaveCount(0);
    await expect(page.getByText(/CNPJ/)).toBeVisible();
  });

  test('a logo sai na ordem de serviço', async ({ paginaLogada: page, request, loja }) => {
    const cliente = await api(request, loja, 'post', '/customers', { type: 'INDIVIDUAL', name: 'Cliente da OS' });
    const orcamento = await api(request, loja, 'post', '/quotes', {
      customerId: cliente.id,
      items: [{ description: 'Mão de obra', quantity: 1, unitPrice: 120 }],
    });
    // Aprovar o orçamento é o que cria a ordem de serviço, e a resposta JÁ é
    // a ordem criada.
    const ordem = await api(request, loja, 'post', `/quotes/${orcamento.id}/approve`, {});
    const ordemId = ordem.id as string;

    await api(request, loja, 'patch', '/settings', { logoUrl: LOGO });
    await page.goto(`/print/service-order/${ordemId}`);
    await expect(page.locator('.print-page img')).toHaveCount(1);
    await expect(page.getByText(loja.nome)).toBeVisible();
  });

  test('escolher em Configurações e ver a prévia mudar antes de salvar', async ({ paginaLogada: page }) => {
    await page.goto('/settings');

    // A prévia do menu vive ao lado do formulário — a legenda "ComerciON" só
    // existe nela.
    const previa = page.locator('.card', { has: page.getByText('ComerciON') }).first();
    await expect(previa).toBeVisible();
    await expect(previa.locator('img'), 'loja nova não tem logo').toHaveCount(0);

    // Escolher o arquivo já deve pintar a prévia, antes de qualquer salvamento.
    await page.locator('input[type=file]').first().setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(LOGO.split(',')[1], 'base64'),
    });
    await expect(previa.locator('img')).toHaveCount(1);

    // E trocar para "Só o nome" deve apagar a imagem da prévia na hora. Este é
    // o ponto da tela: entender a escolha antes de ela virar decisão.
    await page.getByText('Só o nome', { exact: true }).click();
    await expect(page.getByRole('radio', { name: /só o nome/i })).toBeChecked();
    await expect(previa.locator('img'), 'a prévia responde sem salvar').toHaveCount(0);

    await page.getByRole('button', { name: /salvar configurações/i }).click();
    await expect(page.getByText('Configurações salvas.')).toBeVisible();

    // Recarregar prova que foi para o banco, e não só para o estado da tela.
    await page.reload();
    await expect(page.getByRole('radio', { name: /só o nome/i })).toBeChecked();
    await expect(page.locator('aside').locator('img')).toHaveCount(0);
  });
});
