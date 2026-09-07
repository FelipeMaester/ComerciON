import { api, expect, test } from '../fixtures';

/**
 * No balcão, o cliente tem de ser achado — não procurado numa lista.
 *
 * O PDV enchia um `<select>` com os 100 PRIMEIROS clientes. Medido numa loja
 * com 801 cadastrados: a lista terminava em "Auto Center Pereira 82" — não
 * passava nem do "Auto Center", e todo cliente de B a Z era inalcançável.
 * Nada na tela dizia isso.
 *
 * O estrago não é a lentidão, é o dado: sem achar o cliente, quem atende
 * vende como "Cliente avulso" — e aí não há fiado, nem histórico, nem
 * vínculo com o WhatsApp — ou cadastra o mesmo cliente de novo, duplicando a
 * ficha e zerando o limite de crédito que ele já tinha.
 *
 * A busca por nome, telefone e documento já existia na API, com um comentário
 * explicando que no balcão se tem o telefone e não o nome exato. A tela é que
 * nunca a usou.
 */
test.describe('PDV — achar o cliente', () => {
  /**
   * Mais clientes do que cabia no seletor antigo, com o alvo em Z para ele
   * cair fora de qualquer corte alfabético dos primeiros.
   */
  async function lojaComMuitosClientes(
    request: Parameters<typeof api>[0],
    loja: Parameters<typeof api>[1],
  ) {
    for (let i = 1; i <= 30; i++) {
      await api(request, loja, 'post', '/customers', {
        type: 'COMPANY',
        name: `Auto Center ${String(i).padStart(3, '0')}`,
        phone: `1130000${String(i).padStart(3, '0')}`,
      });
    }
    return api(request, loja, 'post', '/customers', {
      type: 'COMPANY',
      name: 'Zé da Esquina Auto Peças',
      phone: '11999997777',
    });
  }

  test('acha pelo nome quem estaria fora do começo da lista', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    const alvo = await lojaComMuitosClientes(request, loja);
    await page.goto('/pos');

    const campo = page.getByLabel('Buscar cliente');
    await expect(campo).toBeVisible();
    await campo.fill('Zé da Esquina');

    await page.getByRole('button', { name: /Zé da Esquina/ }).click();

    // O nome escolhido fica na tela: quem está no balcão precisa ver de quem
    // é a venda sem abrir nada.
    await expect(page.getByLabel('Cliente da venda')).toHaveText(alvo.name);
  });

  test('acha pelo telefone, que é o que o balcão costuma ter na mão', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    await lojaComMuitosClientes(request, loja);
    await page.goto('/pos');

    await page.getByLabel('Buscar cliente').fill('11999997777');
    // Espera o achado aparecer antes do Enter: a busca tem 200 ms de espera
    // entre teclas, e o teste digita instantaneamente — mais rápido do que
    // qualquer pessoa digitando um telefone.
    await expect(page.getByRole('button', { name: /Zé da Esquina/ })).toBeVisible();

    // Um único achado: Enter escolhe, sem tirar a mão do teclado.
    await page.getByLabel('Buscar cliente').press('Enter');

    await expect(page.getByLabel('Cliente da venda')).toHaveText('Zé da Esquina Auto Peças');
  });

  test('diz quantos ficaram de fora quando a busca é ampla', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    await lojaComMuitosClientes(request, loja);
    await page.goto('/pos');

    await page.getByLabel('Buscar cliente').fill('Auto Center');

    // 30 clientes casam, a lista mostra 8. Sem esta frase, quem procura
    // conclui que existem oito — o mesmo engano que a busca de PEÇAS já
    // corrigiu e o lado do cliente tinha ficado para trás.
    await expect(page.getByText('Mostrando 8 de 30.')).toBeVisible();
  });

  test('F3 leva ao campo do cliente, como antes', async ({ paginaLogada: page, request, loja }) => {
    await lojaComMuitosClientes(request, loja);
    await page.goto('/pos');

    await page.keyboard.press('F3');

    await expect(page.getByLabel('Buscar cliente')).toBeFocused();
  });
});
