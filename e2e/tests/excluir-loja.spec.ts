import type { Page } from '@playwright/test';
import { api, expect, test } from '../fixtures';

/**
 * Excluir uma loja pela tela de Administração.
 *
 * A rota existia e nenhuma tela a alcançava — dava para excluir por curl e mais
 * nada. Estes testes cobrem o caminho que a pessoa percorre de verdade, e
 * principalmente as duas travas: o identificador digitado à mão e o fato de a
 * loja de quem executa não poder ser tocada.
 *
 * Usa `page` e não `paginaLogada`: quem enxerga esta tela é o super admin da
 * plataforma, e a fixture entra como dono da loja de teste. Duas sessões
 * brigando pelo mesmo cookie não testam nada.
 */
const SUPER_ADMIN = { email: 'superadmin@demo.local', senha: 'SuperAdmin1234', loja: 'demo' };

/** Entra com uma conta qualquer, trocando a sessão que estiver em uso. */
async function entrar(page: Page, conta: { loja: string; email: string; senha: string }) {
  await page.goto('/login');
  await page.getByPlaceholder('ex: autopecas-silva').fill(conta.loja);
  await page.locator('input[type="email"]').fill(conta.email);
  await page.locator('input[type="password"]').fill(conta.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Espera a navegação do login terminar. Sem isto, um `goto` logo em seguida
  // corre com o `router.push` e a tela volta para o destino do login — foi o
  // que fez este teste procurar "Clientes" no painel.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

async function entrarComoSuperAdmin(page: Page) {
  await entrar(page, { loja: SUPER_ADMIN.loja, email: SUPER_ADMIN.email, senha: SUPER_ADMIN.senha });
  // Cai direto na tela de Administração: o super admin não tem acesso aos
  // dados de loja nenhuma, e mandá-lo para o painel o deixava numa tela vazia.
  await expect(page.getByRole('heading', { name: /Administração/ })).toBeVisible({ timeout: 15_000 });
}

/** A linha da loja alvo na tabela de Administração. */
function linhaDa(page: Page, slug: string) {
  return page.getByRole('row', { name: new RegExp(slug) });
}

async function abrirConfirmacao(page: Page, slug: string) {
  await page.goto('/admin/tenants');
  const linha = linhaDa(page, slug);
  await expect(linha).toBeVisible({ timeout: 15_000 });
  await linha.getByRole('button', { name: 'Excluir' }).click();
}

test.describe('excluir loja', () => {
  test('o botão só libera depois do identificador digitado certo', async ({ page, loja }) => {
    await entrarComoSuperAdmin(page);
    await abrirConfirmacao(page, loja.slug);

    const botao = page.getByRole('button', { name: 'Excluir para sempre' });
    await expect(botao, 'nasce travado').toBeDisabled();

    const campo = page.getByLabel(/Identificador da loja/);
    await campo.fill(loja.slug.slice(0, -1));
    await expect(botao, 'quase certo ainda é errado').toBeDisabled();

    await campo.fill(loja.slug);
    await expect(botao, 'identificador exato libera').toBeEnabled();
  });

  test('excluir tira a loja da lista', async ({ page, loja }) => {
    await entrarComoSuperAdmin(page);
    await abrirConfirmacao(page, loja.slug);

    await page.getByLabel(/Identificador da loja/).fill(loja.slug);
    await page.getByRole('button', { name: 'Excluir para sempre' }).click();

    await expect(linhaDa(page, loja.slug)).toHaveCount(0, { timeout: 15_000 });
  });

  test('desistir fecha a confirmação sem apagar nada', async ({ page, loja }) => {
    await entrarComoSuperAdmin(page);
    await abrirConfirmacao(page, loja.slug);

    await page.getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByRole('button', { name: 'Excluir para sempre' })).toHaveCount(0);
    await expect(linhaDa(page, loja.slug), 'a loja continua na lista').toBeVisible();
  });

  /**
   * O erro que cometi ao construir isto: a exclusão apagou os dados da loja de
   * QUEM executou, porque o filtro por loja sobrescrevia o alvo. A loja do
   * super admin é a "demo", e é ela que este teste mede — antes e depois.
   *
   * A contagem passa pela sessão do ADMIN da demo, e não pela do super admin:
   * o super admin não enxerga dado de loja nenhuma, então contar por ele
   * devolveria sempre a linha de "nenhum cliente" e o teste não mediria nada.
   * A primeira versão fazia exatamente isso — passava sem testar.
   */
  test('não encosta na loja de quem está excluindo', async ({ page, loja }) => {
    // Conta ORÇAMENTOS, e não clientes: a exclusão remove cinco tabelas antes
    // da loja — caixa, movimentação, tarefas, ordens de serviço e orçamentos —
    // e eram essas que iam junto quando ela mirava a loja errada. Cliente não
    // está entre elas, e foi contando cliente que a primeira versão deste teste
    // passou com o defeito no lugar.
    const contarOrcamentosDaDemo = async () => {
      await entrar(page, { loja: 'demo', email: 'admin@demo.local', senha: 'Demo1234' });
      await page.goto('/quotes');
      await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 });
      return page.locator('tbody tr').count();
    };

    const antes = await contarOrcamentosDaDemo();
    expect(antes, 'a demo precisa ter orçamentos para este teste medir algo').toBeGreaterThan(1);

    await entrarComoSuperAdmin(page);
    await abrirConfirmacao(page, loja.slug);
    await page.getByLabel(/Identificador da loja/).fill(loja.slug);
    await page.getByRole('button', { name: 'Excluir para sempre' }).click();
    await expect(linhaDa(page, loja.slug)).toHaveCount(0, { timeout: 15_000 });

    const depois = await contarOrcamentosDaDemo();
    expect(depois, 'a loja de quem excluiu perdeu orçamentos').toBe(antes);
  });
});
