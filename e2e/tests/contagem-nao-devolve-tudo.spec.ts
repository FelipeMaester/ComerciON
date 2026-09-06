import { API_URL, api, expect, test } from '../fixtures';

/**
 * Contar o inventário não pode custar a loja inteira por peça digitada.
 *
 * Medido numa loja com 4.000 peças, antes desta correção:
 *
 *   abrir a contagem ......... 1.427.175 bytes
 *   SALVAR UMA PEÇA .......... 1.427.172 bytes
 *   listar as contagens .........184.333 bytes
 *
 * A tela de "Salvar" devolvia a contagem inteira a cada peça. Contar as 4.000
 * peças eram 4.000 salvamentos de 1,4 MB — quase 6 GB — e a tabela de 4.000
 * linhas redesenhada a cada um. Quem faz o inventário anda pelo galpão com o
 * tablet no wi-fi da loja; a tela ia ficando mais lenta a cada peça contada,
 * justamente quando faltava mais para contar.
 *
 * A listagem tinha a mesma origem: carregava os itens de cada contagem só para
 * escrever o número deles na coluna "Itens".
 */
test.describe('contagem de estoque', () => {
  const PECAS = 60;

  async function lojaComCatalogo(
    request: Parameters<typeof api>[0],
    loja: Parameters<typeof api>[1],
  ) {
    for (let i = 1; i <= PECAS; i++) {
      await api(request, loja, 'post', '/products', {
        sku: `CONT-${String(i).padStart(3, '0')}`,
        name: i === 42 ? 'Bomba d’água Corsa' : `Peça de contagem ${i}`,
        price: 100,
        costPrice: 50,
      });
    }
    const [deposito] = await api(request, loja, 'get', '/warehouses');
    const contagem = await api(request, loja, 'post', '/inventory/stock-counts', {
      warehouseId: deposito.id,
    });
    return contagem;
  }

  test('salvar uma peça devolve a peça, não a contagem inteira', async ({ request, loja }) => {
    const contagem = await lojaComCatalogo(request, loja);

    const ficha = await api(request, loja, 'get', `/inventory/stock-counts/${contagem.id}`);
    expect(ficha, 'a ficha não carrega mais os itens junto').not.toHaveProperty('items');
    expect(ficha.resumo).toEqual({ total: PECAS, contados: 0, pendentes: PECAS, divergentes: 0 });

    const { items } = await api(
      request,
      loja,
      'get',
      `/inventory/stock-counts/${contagem.id}/items?pageSize=100`,
    );
    const item = items.find((i: { product: { sku: string } }) => i.product.sku === 'CONT-042');

    const resposta = await request.patch(
      `${API_URL}/api/inventory/stock-counts/${contagem.id}/items/${item.id}`,
      {
        headers: { Authorization: `Bearer ${loja.accessToken}`, 'x-tenant-slug': loja.slug },
        data: { countedQty: 3 },
      },
    );
    expect(resposta.ok()).toBeTruthy();
    const corpo = await resposta.json();

    // O formato: a peça salva e os totais do cabeçalho. Nada de lista.
    expect(corpo.item.id).toBe(item.id);
    expect(corpo.item.countedQty).toBe(3);
    expect(corpo).not.toHaveProperty('items');
    expect(corpo.resumo).toEqual({ total: PECAS, contados: 1, pendentes: PECAS - 1, divergentes: 1 });

    // E o tamanho, que é o defeito em si. Salvar UMA peça não pode pesar mais
    // que uma página inteira de peças — se voltar a devolver a contagem toda,
    // esta conta inverte, e inverte mais quanto maior for a loja.
    const bytesDoSalvamento = (await resposta.body()).length;
    const umaPagina = await request.get(
      `${API_URL}/api/inventory/stock-counts/${contagem.id}/items?pageSize=25`,
      { headers: { Authorization: `Bearer ${loja.accessToken}`, 'x-tenant-slug': loja.slug } },
    );
    const bytesDeUmaPagina = (await umaPagina.body()).length;
    expect(
      bytesDoSalvamento,
      `salvar uma peça trafegou ${bytesDoSalvamento} bytes; uma página de 25 peças tem ${bytesDeUmaPagina}`,
    ).toBeLessThan(bytesDeUmaPagina);
  });

  test('os itens vêm paginados, filtrados e buscáveis', async ({ request, loja }) => {
    const contagem = await lojaComCatalogo(request, loja);
    const base = `/inventory/stock-counts/${contagem.id}/items`;

    const primeira = await api(request, loja, 'get', `${base}?page=1`);
    expect(primeira.total).toBe(PECAS);
    expect(primeira.items).toHaveLength(25);
    expect(primeira.totalPages).toBe(3);

    // Controle: a página 3 traz o resto, e nenhuma peça se repete entre as
    // páginas. Ordem instável faria a contagem pular peça sem ninguém ver.
    const terceira = await api(request, loja, 'get', `${base}?page=3`);
    expect(terceira.items).toHaveLength(PECAS - 50);
    const ids = new Set([...primeira.items, ...terceira.items].map((i: { id: string }) => i.id));
    expect(ids.size).toBe(25 + (PECAS - 50));

    const alvo = primeira.items[0];
    await api(request, loja, 'patch', `${base}/${alvo.id}`, { countedQty: alvo.expectedQty });

    const pendentes = await api(request, loja, 'get', `${base}?situacao=PENDENTES`);
    expect(pendentes.total, 'a peça contada sai dos pendentes').toBe(PECAS - 1);

    const divergentes = await api(request, loja, 'get', `${base}?situacao=DIVERGENTES`);
    expect(divergentes.total, 'contou igual ao sistema: não é divergência').toBe(0);

    const busca = await api(request, loja, 'get', `${base}?search=CONT-042`);
    expect(busca.total).toBe(1);
    expect(busca.items[0].product.name).toBe('Bomba d’água Corsa');
  });

  test('contar uma peça atualiza a linha e o cabeçalho, sem recarregar a lista', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    const contagem = await lojaComCatalogo(request, loja);
    await page.goto(`/stock-counts/${contagem.id}`);

    // O número exato, e não "o cabeçalho contém 59": no mesmo bloco fica a hora
    // de abertura, e uma contagem aberta aos 59 segundos deixaria a asserção
    // passar sozinha.
    const naoContadas = page
      .locator('main dl > div')
      .filter({ hasText: 'Ainda não contadas' })
      .locator('dd');

    // O padrão da tela é "ainda não contadas": quem abre a contagem quer ver o
    // que falta. Uma página de 25, não as 60.
    await expect(naoContadas).toHaveText('60');
    await expect(page.locator('main tbody tr')).toHaveCount(25);

    const primeira = page.locator('main tbody tr').first();
    await primeira.locator('input[type="number"]').fill('5');
    await primeira.locator('input[type="number"]').press('Enter');

    // O cabeçalho é contado no banco e volta junto com a peça salva.
    await expect(naoContadas).toHaveText('59');
    await expect(primeira.locator('td').nth(3), 'a diferença aparece na linha').toContainText('+5');
    // E a peça continua na tela mesmo tendo saído do filtro "não contadas":
    // sumir no instante do salvamento faz perder a referência de onde estava.
    await expect(page.locator('main tbody tr')).toHaveCount(25);
  });

  test('a listagem conta os itens sem carregá-los', async ({ request, loja }) => {
    const contagem = await lojaComCatalogo(request, loja);

    const lista = await api(request, loja, 'get', '/inventory/stock-counts');
    expect(lista.total).toBe(1);
    const [primeira] = lista.items;
    expect(primeira.id).toBe(contagem.id);
    expect(primeira._count.items, 'a coluna "Itens" vem do banco').toBe(PECAS);
    expect(primeira, 'e não de uma lista de itens carregada à toa').not.toHaveProperty('items');
  });
});
