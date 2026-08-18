import { api, expect, test } from '../fixtures';

/**
 * Ordenação, colunas, CSV e atalhos: os quatro deixam a mesma tela servir
 * gente diferente sem virar telas diferentes.
 */
test.describe('listas configuráveis', () => {
  async function tresPecas(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1]) {
    for (const [sku, name, price] of [
      ['B-002', 'Bomba de água', 210],
      ['A-001', 'Amortecedor dianteiro', 89.9],
      ['C-003', 'Correia dentada', 145.5],
    ] as const) {
      await api(request, loja, 'post', '/products', { sku, name, price, costPrice: Number(price) / 2 });
    }
  }

  test('clicar no cabeçalho ordena, e o terceiro clique volta ao normal', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    await tresPecas(request, loja);
    await page.goto('/products');

    const primeiraLinha = () => page.locator('tbody tr').first().locator('td').nth(1);
    const cabecalhoPreco = page.getByRole('columnheader', { name: 'Preço' }).getByRole('button');

    await cabecalhoPreco.click();
    await expect(primeiraLinha(), 'crescente: o mais barato primeiro').toContainText('Amortecedor');

    await cabecalhoPreco.click();
    await expect(primeiraLinha(), 'decrescente: o mais caro primeiro').toContainText('Bomba');

    // Terceiro clique desfaz: quem ordenou por engano precisa de saída.
    await cabecalhoPreco.click();
    await expect(page.locator('th[aria-sort="ascending"], th[aria-sort="descending"]')).toHaveCount(0);
  });

  test('a ordenação sobrevive a recarregar a página', async ({ paginaLogada: page, request, loja }) => {
    await tresPecas(request, loja);
    await page.goto('/products');

    const primeiroNome = page.locator('tbody tr').first().locator('td').nth(1);
    // Guarda a ordem natural ANTES de mexer: sem isso, o teste poderia estar
    // conferindo uma ordem que já era a padrão, e passaria mesmo sem a
    // preferência ser gravada.
    await expect(primeiroNome).toBeVisible();
    const ordemNatural = await primeiroNome.innerText();

    // Duas vezes: decrescente por preço, que é o oposto de qualquer ordem
    // alfabética que a API devolva.
    const cabecalhoPreco = page.getByRole('columnheader', { name: 'Preço' }).getByRole('button');
    await cabecalhoPreco.click();
    await cabecalhoPreco.click();
    await expect(primeiroNome).toContainText('Bomba');
    expect(ordemNatural, 'a ordem escolhida precisa ser diferente da natural').not.toContain('Bomba');

    await page.reload();
    // Preferência que se perde a cada navegação não é preferência.
    await expect(primeiroNome).toContainText('Bomba');
    await expect(page.locator('th[aria-sort="descending"]')).toHaveCount(1);
  });

  test('esconder uma coluna tira a célula, não desalinha a linha', async ({ paginaLogada: page, request, loja }) => {
    await tresPecas(request, loja);
    await page.goto('/products');

    const colunasNoCabecalho = page.locator('thead th');
    // Esperar a tabela existir antes de contar: enquanto a lista carrega a
    // tela mostra esqueleto, e uma contagem aqui daria zero.
    await expect(colunasNoCabecalho.first()).toBeVisible();
    const antes = await colunasNoCabecalho.count();

    await page.getByRole('button', { name: /colunas/i }).click();
    await page.getByRole('checkbox', { name: 'Marca' }).uncheck();

    await expect(colunasNoCabecalho).toHaveCount(antes - 1);
    // O corpo tem que acompanhar: célula sobrando desalinharia toda a tabela.
    await expect(page.locator('tbody tr').first().locator('td')).toHaveCount(antes - 1);
    await expect(page.getByRole('columnheader', { name: /marca/i })).toHaveCount(0);
  });

  test('a coluna que identifica a linha não pode ser escondida', async ({ paginaLogada: page }) => {
    await page.goto('/products');
    await page.getByRole('button', { name: /colunas/i }).click();
    // Sem SKU e Nome, uma tabela de preços não diz de qual peça é o preço.
    await expect(page.getByRole('checkbox', { name: 'Nome' })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: 'SKU' })).toBeDisabled();
  });

  test('o CSV baixa o que está na tela, com as colunas escolhidas', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    await tresPecas(request, loja);
    await page.goto('/products');

    await page.getByRole('button', { name: /colunas/i }).click();
    await page.getByRole('checkbox', { name: 'Marca' }).uncheck();
    await page.keyboard.press('Escape');
    await page.getByRole('columnheader', { name: 'Preço' }).getByRole('button').click();

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV' }).click(),
    ]).then(([d]) => d);

    const caminho = await download.path();
    const conteudo = require('fs').readFileSync(caminho!, 'utf8') as string;
    const linhas = conteudo.split('\r\n');

    // Cabeçalho sem a coluna escondida, e com ponto-e-vírgula (o Excel
    // brasileiro usa a vírgula como separador decimal).
    expect(linhas[0]).toBe('\ufeffSKU;Nome;Preço;Estoque;Mínimo');
    // Na ordem que estava na tela: o mais barato primeiro.
    expect(linhas[1]).toContain('Amortecedor dianteiro');
    // Decimal com vírgula, para a planilha somar a coluna.
    expect(linhas[1]).toContain('89,9');
    expect(linhas).toHaveLength(4);
  });
});

test.describe('atalhos de teclado', () => {
  test('"g" e depois a letra leva à tela', async ({ paginaLogada: page }) => {
    await page.goto('/dashboard');
    await page.keyboard.press('g');
    await page.keyboard.press('p');
    await expect(page).toHaveURL(/\/products/);

    await page.keyboard.press('g');
    await page.keyboard.press('c');
    await expect(page).toHaveURL(/\/customers/);
  });

  test('digitar num campo não dispara atalho', async ({ paginaLogada: page }) => {
    await page.goto('/products');
    const busca = page.getByPlaceholder(/buscar por nome/i);
    // `pressSequentially`, e NÃO `fill`: fill escreve o valor de uma vez e não
    // dispara keydown nenhum, então o teste passaria mesmo com o atalho
    // roubando as teclas — foi o que aconteceu na primeira versão deste teste.
    await busca.click();
    await busca.pressSequentially('engrenagem gp');

    await expect(page).toHaveURL(/\/products/);
    await expect(busca).toHaveValue('engrenagem gp');
  });

  test('"?" abre a lista de atalhos e Esc fecha', async ({ paginaLogada: page }) => {
    await page.goto('/dashboard');
    await page.keyboard.press('?');

    const ajuda = page.getByRole('dialog', { name: /atalhos de teclado/i });
    await expect(ajuda).toBeVisible();
    // Atalho que ninguém descobre é atalho que não existe: a ajuda precisa
    // ensinar os do balcão também.
    await expect(ajuda.getByText('Finalizar a venda')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(ajuda).toBeHidden();
  });
});
