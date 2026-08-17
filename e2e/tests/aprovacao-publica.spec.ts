import { api, expect, test } from '../fixtures';

/**
 * Aprovação de orçamento pelo cliente, sem conta e sem sessão.
 *
 * Este fluxo morava na loja virtual. Quando a loja foi removida, ele mudou de
 * aplicação — passou a ser servido pelo próprio painel, em /aprovar/[token],
 * contra um controller novo (`/public/quotes`). Mudança de app é exatamente o
 * tipo de coisa que type-check e teste unitário não pegam: os dois lados
 * compilam sozinhos e mesmo assim o link pode não abrir.
 *
 * O navegador aqui NÃO está logado de propósito — é assim que o cliente chega.
 */
test.describe('aprovação pública de orçamento', () => {
  async function criarOrcamento(request: Parameters<typeof api>[0], loja: Parameters<typeof api>[1]) {
    const cliente = await api(request, loja, 'post', '/customers', {
      type: 'INDIVIDUAL',
      name: 'Dona Cecília',
      phone: '11977776666',
    });
    return api(request, loja, 'post', '/quotes', {
      customerId: cliente.id,
      description: 'Revisão dos freios',
      items: [{ description: 'Pastilha dianteira', quantity: 2, unitPrice: 180 }],
    });
  }

  test('o cliente abre o link, vê os itens e aprova — e vira ordem de serviço', async ({ page, request, loja }) => {
    const orcamento = await criarOrcamento(request, loja);

    await page.goto(`/aprovar/${orcamento.publicToken}?loja=${loja.slug}`);

    await expect(page.getByRole('heading', { name: 'Dona Cecília' })).toBeVisible();
    await expect(page.getByText('Pastilha dianteira')).toBeVisible();
    // 2 × 180 — o total precisa bater com o que o cliente está aprovando.
    // Formato brasileiro: era "R$ 360.00" — ponto decimal e sem separador de
    // milhar — em todo o painel até a repaginação do visual.
    await expect(page.getByText('R$ 360,00').first()).toBeVisible();

    await page.getByRole('button', { name: /aprovar orçamento/i }).click();

    await expect(page.getByText(/ordem de serviço já foi gerada/i)).toBeVisible();

    // E do lado de dentro: a OS existe mesmo, não só a mensagem na tela.
    const ordens = await api(request, loja, 'get', '/service-orders');
    expect(ordens.length).toBe(1);
  });

  test('recusar registra a recusa e tira os botões', async ({ page, request, loja }) => {
    const orcamento = await criarOrcamento(request, loja);

    await page.goto(`/aprovar/${orcamento.publicToken}?loja=${loja.slug}`);
    await page.getByRole('button', { name: /recusar/i }).click();

    await expect(page.getByText('Recusado')).toBeVisible();
    await expect(page.getByRole('button', { name: /aprovar orçamento/i })).toBeHidden();
  });

  test('token inválido não expõe nada — mostra erro, não o orçamento de outra pessoa', async ({ page, loja }) => {
    await page.goto(`/aprovar/token-que-nao-existe?loja=${loja.slug}`);

    await expect(page.getByText(/confira se veio inteiro/i)).toBeVisible();
  });
});
