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

/**
 * Lista com mais de uma página: onde a tela contava meia verdade.
 *
 * Medido antes da correção, com 30 peças (a lista pagina em 25): o CSV saía
 * com 25 linhas e a ordenação decrescente por preço apontava a peça de R$ 250
 * como a mais cara, quando existia uma de R$ 300 na página seguinte. Nada na
 * tela avisava — quem exporta a lista para mandar ao fornecedor descobriria
 * pelo pedido errado.
 *
 * Hoje o CSV busca todas as páginas e a ordenação vai ao banco. Sobrou uma
 * exceção honesta, coberta abaixo: colunas calculadas depois da consulta, que
 * o banco não tem como ordenar.
 */
test.describe('lista com mais de uma página', () => {
  async function trintaPecas(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1]) {
    for (let i = 1; i <= 30; i++) {
      await api(request, loja, 'post', '/products', {
        sku: `PAG-${String(i).padStart(3, '0')}`,
        name: `Peça ${String(i).padStart(3, '0')}`,
        price: i * 10,
        costPrice: i * 4,
      });
    }
  }

  test('o CSV traz a lista inteira, não só a página', async ({ paginaLogada: page, request, loja }) => {
    await trintaPecas(request, loja);
    await page.goto('/products');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.locator('tbody tr'), 'a tela mostra uma página').toHaveCount(25);

    // O botão diz o que vai baixar antes do clique.
    const botao = page.getByRole('button', { name: /CSV/ });
    await expect(botao).toContainText('30');

    const download = await Promise.all([page.waitForEvent('download'), botao.click()]).then(([d]) => d);
    const conteudo = require('fs').readFileSync((await download.path())!, 'utf8') as string;
    const linhas = conteudo.trim().split('\r\n');

    expect(linhas.length - 1, 'todas as 30 peças no arquivo').toBe(30);
    // A peça que só existe na segunda página precisa estar lá.
    expect(conteudo).toContain('Peça 030');
  });

  test('o CSV sai na ordem escolhida na tela, inclusive nas linhas que não estavam nela', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    await trintaPecas(request, loja);
    await page.goto('/products');
    const preco = page.getByRole('columnheader', { name: 'Preço' }).getByRole('button');
    await preco.click();
    await preco.click();

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /CSV/ }).click(),
    ]).then(([d]) => d);
    const linhas = (require('fs').readFileSync((await download.path())!, 'utf8') as string).trim().split('\r\n');

    // Decrescente por preço: a primeira linha do arquivo é a peça de R$ 300,
    // que estava na SEGUNDA página da tela.
    expect(linhas[1]).toContain('Peça 030');
    expect(linhas[30]).toContain('Peça 001');
  });

  test('ordenar por preço alcança a lista inteira, não só a página', async ({ paginaLogada: page, request, loja }) => {
    await trintaPecas(request, loja);
    await page.goto('/products');
    await expect(page.locator('tbody tr')).toHaveCount(25);

    // Na ordem natural a Peça 030 (R$ 300, a mais cara) está na SEGUNDA página.
    // É exatamente a linha que a ordenação por página não conseguia alcançar.
    await expect(page.locator('tbody tr').first()).not.toContainText('Peça 030');

    const preco = page.getByRole('columnheader', { name: 'Preço' }).getByRole('button');
    await preco.click();
    await preco.click();

    // Se ela subiu ao topo, quem ordenou foi o banco: a resposta agora é a
    // peça mais cara da loja, e não a mais cara das 25 que estavam carregadas.
    await expect(page.locator('tbody tr').first()).toContainText('Peça 030');
    await expect(page.getByText(/ordenada só nas/), 'sem meia verdade a avisar').toHaveCount(0);
  });

  test('a coluna que o banco não sabe ordenar continua avisando', async ({ paginaLogada: page, request, loja }) => {
    await trintaPecas(request, loja);
    await page.goto('/products');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByText(/ordenada só nas/)).toHaveCount(0);

    // Estoque é a soma das linhas de estoque de cada depósito, somada depois da
    // consulta — não existe coluna para o banco ordenar. Essa continua sendo
    // por página, e o aviso continua sendo obrigatório.
    await page.getByRole('columnheader', { name: 'Estoque' }).getByRole('button').click();
    await expect(page.getByText(/Esta coluna é ordenada só nas 25 linhas desta página, não nas 30/)).toBeVisible();
  });
});
