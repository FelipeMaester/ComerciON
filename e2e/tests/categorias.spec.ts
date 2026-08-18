import { api, expect, test } from '../fixtures';

/**
 * Categorias das peças, do começo ao fim.
 *
 * A API tinha o CRUD completo desde a Fase 1 e nenhuma tela o alcançava: o
 * cadastro de produto listava categorias, e não existia lugar nenhum para
 * criar uma. Numa loja recém-criada o seletor abria com uma opção só, "Sem
 * categoria", e não havia saída — o estoque inteiro era cadastrado sem
 * classificação.
 *
 * O teste percorre o caminho da loja de verdade: criar a categoria na hora do
 * cadastro da peça, trocar depois, renomear e excluir.
 */
test.describe('categorias das peças', () => {
  test('dá para criar a categoria sem sair do cadastro da peça', async ({ paginaLogada: page }) => {
    await page.goto('/products');
    await page.getByRole('button', { name: 'Novo produto' }).click();

    // `exact` importa: a busca da própria tela tem o placeholder "Buscar por
    // nome, SKU ou código de barras", e sem isso o seletor casa com dois campos.
    const campoSku = page.getByPlaceholder('SKU', { exact: true });

    // O caminho que não existia: escolher "Nova categoria" dentro do próprio
    // formulário, sem perder o que já foi digitado.
    await campoSku.fill('CAT-001');
    await page.getByPlaceholder('Nome', { exact: true }).fill('Radiador de teste');

    await page.getByLabel('Categoria').selectOption('__nova__');
    await page.getByPlaceholder('Nome da categoria').fill('Radiadores');
    await page.getByRole('button', { name: 'Criar' }).click();

    // Criada E já selecionada: se só criasse, a pessoa teria de escolher de novo.
    const seletor = page.getByLabel('Categoria');
    await expect(seletor).toHaveValue(/.+/);
    const escolhida = await seletor.inputValue();
    expect(escolhida).not.toBe('');
    expect(escolhida).not.toBe('__nova__');

    // E o que já estava digitado continua lá.
    await expect(campoSku).toHaveValue('CAT-001');

    await page.getByPlaceholder('Preço de venda').fill('320');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();

    await expect(page.getByText('Radiador de teste')).toBeVisible();
  });

  test('a mesma categoria não é criada duas vezes', async ({ paginaLogada: page, request, loja }) => {
    await api(request, loja, 'post', '/categories', { name: 'Ventoinhas' });

    await page.goto('/products');
    await page.getByRole('button', { name: 'Novo produto' }).click();
    await page.getByLabel('Categoria').selectOption('__nova__');

    // Mesmo nome, caixa diferente: precisa reaproveitar a que existe. Duas
    // "Ventoinhas" na lista deixam a pessoa sem saber em qual classificar.
    await page.getByPlaceholder('Nome da categoria').fill('ventoinhas');
    await page.getByRole('button', { name: 'Criar' }).click();

    await expect(page.getByLabel('Categoria')).toHaveValue(/.+/);
    await page.goto('/categories');
    await expect(page.getByRole('cell', { name: 'Ventoinhas', exact: true })).toHaveCount(1);
  });

  test('dá para trocar a categoria de uma peça já cadastrada', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    const antiga = await api(request, loja, 'post', '/categories', { name: 'Classificação errada' });
    await api(request, loja, 'post', '/categories', { name: 'Radiadores' });
    const peca = await api(request, loja, 'post', '/products', {
      sku: 'TROCA-001',
      name: 'Peça classificada errado',
      price: 100,
      costPrice: 40,
      minStock: 0,
      categoryId: antiga.id,
    });

    await page.goto(`/products/${peca.id}`);
    await expect(page.getByText('Classificação errada')).toBeVisible();

    await page.getByRole('button', { name: 'trocar' }).click();
    await page.getByLabel('Categoria').selectOption({ label: 'Radiadores' });

    // A ficha volta ao modo leitura já com a categoria nova — e ela sobrevive
    // à recarga, porque foi gravada e não só trocada na tela.
    await expect(page.getByText('Radiadores')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Radiadores')).toBeVisible();
    await expect(page.getByText('Classificação errada')).toHaveCount(0);
  });

  test('a tela mostra quantas peças cada categoria tem', async ({ paginaLogada: page, request, loja }) => {
    const categoria = await api(request, loja, 'post', '/categories', { name: 'Mangueiras' });
    for (const sku of ['MANG-1', 'MANG-2']) {
      await api(request, loja, 'post', '/products', {
        sku,
        name: `Mangueira ${sku}`,
        price: 50,
        costPrice: 20,
        minStock: 0,
        categoryId: categoria.id,
      });
    }
    await api(request, loja, 'post', '/categories', { name: 'Vazia' });

    await page.goto('/categories');

    // A contagem é o que permite avisar antes de excluir; sem ela, apagar uma
    // categoria tira a classificação de dezenas de peças em silêncio.
    const linha = (nome: string) => page.locator('tr', { hasText: nome });
    await expect(linha('Mangueiras').locator('td').nth(1)).toHaveText('2');
    await expect(linha('Vazia').locator('td').nth(1)).toHaveText('—');
  });

  test('renomear corrige o erro de digitação em todo lugar', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    const categoria = await api(request, loja, 'post', '/categories', { name: 'Radiadors' });
    await api(request, loja, 'post', '/products', {
      sku: 'REN-001',
      name: 'Peça da categoria com erro',
      price: 100,
      costPrice: 40,
      minStock: 0,
      categoryId: categoria.id,
    });

    await page.goto('/categories');
    // Localizador por POSIÇÃO, não por texto: `filter({hasText})` é reavaliado
    // a cada ação, e assim que o nome vira um campo de edição ele some do texto
    // da linha — o filtro deixa de casar no meio do caminho. A loja do teste
    // tem uma categoria só, então a primeira linha é ela.
    const linha = page.locator('tbody tr').first();
    await expect(linha).toContainText('Radiadors');

    await linha.getByRole('button', { name: 'Renomear' }).click();
    await linha.locator('input').fill('Radiadores');
    await linha.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByRole('cell', { name: 'Radiadores', exact: true })).toBeVisible();

    // O nome novo vale para a peça que já estava classificada — é a mesma
    // categoria, não uma cópia.
    await page.goto('/products?categoria=' + categoria.id);
    await expect(page.getByText('Peça da categoria com erro')).toBeVisible();
  });

  test('o número de peças leva para a lista filtrada', async ({ paginaLogada: page, request, loja }) => {
    const categoria = await api(request, loja, 'post', '/categories', { name: 'Correias' });
    await api(request, loja, 'post', '/products', {
      sku: 'FILTRO-1',
      name: 'Correia dentada',
      price: 80,
      costPrice: 30,
      minStock: 0,
      categoryId: categoria.id,
    });
    await api(request, loja, 'post', '/products', {
      sku: 'FILTRO-2',
      name: 'Peça de outra categoria',
      price: 90,
      costPrice: 30,
      minStock: 0,
    });

    await page.goto('/categories');
    await page.locator('tr', { hasText: 'Correias' }).getByRole('link', { name: '1' }).click();

    await expect(page).toHaveURL(/categoria=/);
    await expect(page.getByText('Correia dentada')).toBeVisible();
    // O controle: sem o filtro valendo, a outra peça também apareceria e o
    // teste passaria por a lista estar cheia, não por estar filtrada.
    await expect(page.getByText('Peça de outra categoria')).toHaveCount(0);
    // Filtro invisível é a receita para "sumiram meus produtos".
    await expect(page.getByText('Correias')).toBeVisible();
  });
});
