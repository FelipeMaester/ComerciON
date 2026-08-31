import { expect, test } from '../fixtures';

/**
 * A categoria criada no meio do cadastro não pode sumir sozinha.
 *
 * A tela de Produtos pede `/categories` uma vez, ao abrir. Criar uma categoria
 * de dentro do formulário acrescenta a nova à lista em memória. Se a resposta
 * daquele primeiro pedido chegar DEPOIS disso, ela substitui o array inteiro —
 * e a categoria recém-criada, que o servidor ainda não conhecia quando o
 * pedido saiu, desaparece.
 *
 * O efeito visível é pior que o sumiço: o `<select>` é controlado e aponta para
 * um id que já não tem `<option>`. O navegador então mostra "Sem categoria", e
 * a pessoa salva a peça sem categoria nenhuma achando que escolheu uma.
 *
 * Some na máquina rápida e aparece sob carga, que é como apareceu: uma falha
 * isolada numa execução cheia da suíte, passando quando rodada sozinha.
 */
test('a categoria criada sobrevive à resposta atrasada da lista', async ({ paginaLogada: page }) => {
  // Segura a PRIMEIRA listagem de categorias e solta depois que a nova já foi
  // criada — que é o cenário de conexão ruim, sem depender de sorte.
  let primeira = true;
  let soltar = () => {};
  const presa = new Promise<void>((resolve) => {
    soltar = resolve;
  });

  await page.route(/\/categories(\?|$)/, async (rota) => {
    if (!primeira) {
      await rota.continue();
      return;
    }
    primeira = false;

    // Busca AGORA e entrega DEPOIS. Segurar o pedido em vez da resposta não
    // reproduz nada: quando ele finalmente sai, o servidor já conhece a
    // categoria nova e devolve a lista certa. A primeira versão deste teste
    // fazia isso e passava — pelo motivo errado, que é a pior forma de passar.
    const listaAntiga = await rota.fetch();
    await presa;
    await rota.fulfill({ response: listaAntiga });
  });

  await page.goto('/products');
  await page.getByRole('button', { name: 'Novo produto' }).click();

  await page.getByPlaceholder('SKU', { exact: true }).fill('CAT-RACE-001');
  await page.getByPlaceholder('Nome', { exact: true }).fill('Radiador de teste');

  await page.getByLabel('Categoria').selectOption('__nova__');
  await page.getByPlaceholder('Nome da categoria').fill('Radiadores');
  await page.getByRole('button', { name: 'Criar' }).click();

  const seletor = page.getByLabel('Categoria');
  await expect(seletor).toHaveValue(/.+/);
  const escolhida = await seletor.inputValue();

  // Agora a listagem atrasada chega, trazendo a lista de ANTES da criação.
  soltar();
  // Uma batida para o React renderizar o que não deveria renderizar.
  await page.waitForTimeout(800);

  await expect(seletor, 'a resposta atrasada apagou a categoria recém-criada').toHaveValue(escolhida);
  await expect(page.getByRole('option', { name: 'Radiadores' })).toHaveCount(1);
});
