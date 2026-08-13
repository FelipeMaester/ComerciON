import { API_URL, criarLoja, expect, SENHA, test } from '../fixtures';

/**
 * "Esqueci minha senha" atravessa API, e-mail e duas telas. Nenhum teste
 * unitário cobre essa costura.
 *
 * O link é lido do Mailpit, um servidor SMTP de teste que guarda tudo em
 * memória e expõe uma API HTTP. Se ele não estiver no ar, o teste é PULADO em
 * vez de falhar: falha vermelha por infraestrutura ausente treina o time a
 * ignorar a suíte.
 *
 *   docker run -d --rm --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
 *   (e a API precisa estar com MAIL_PROVIDER=smtp apontando para a 1025)
 */
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';

test.describe('recuperação de senha', () => {
  test.beforeEach(async ({ request }) => {
    const disponivel = await request
      .get(`${MAILPIT}/api/v1/messages`)
      .then((r) => r.ok())
      .catch(() => false);
    test.skip(!disponivel, 'Mailpit não está no ar — ver o cabeçalho deste arquivo');
  });

  test('pede o link, redefine e entra com a senha nova', async ({ page, request }) => {
    const loja = await criarLoja(request);
    const NOVA_SENHA = 'SenhaNovaE2E456';

    // 1. Pedir o link pela tela.
    await page.goto('/forgot-password');
    await page.getByPlaceholder('ex: autopecas-silva').fill(loja.slug);
    await page.locator('input[type=email]').fill(loja.email);
    await page.getByRole('button', { name: /enviar link/i }).click();
    await expect(page.getByText(/se este e-mail estiver cadastrado/i)).toBeVisible();

    // 2. Achar o e-mail desta loja. O filtro por destinatário importa: a
    //    caixa é compartilhada e pegar "a última mensagem" quebraria assim
    //    que dois testes rodassem em paralelo.
    let link = '';
    await expect(async () => {
      const caixa = await (await request.get(`${MAILPIT}/api/v1/messages`)).json();
      const mensagem = caixa.messages.find((m: { To: { Address: string }[] }) =>
        m.To.some((d) => d.Address === loja.email),
      );
      expect(mensagem, 'o e-mail de redefinição deveria ter chegado').toBeTruthy();

      const conteudo = await (await request.get(`${MAILPIT}/api/v1/message/${mensagem.ID}`)).json();
      const achado = conteudo.Text.match(/https?:\/\/\S*reset-password\S+/);
      expect(achado, 'o e-mail precisa conter o link').toBeTruthy();
      link = achado[0];
    }).toPass({ timeout: 15_000 });

    // 3. Abrir o link e escolher a nova senha.
    await page.goto(link);
    const campos = page.locator('input[type=password]');
    await campos.first().fill(NOVA_SENHA);
    await campos.last().fill(NOVA_SENHA);
    await page.getByRole('button', { name: /salvar nova senha/i }).click();
    await expect(page.getByText(/senha alterada/i)).toBeVisible();

    // 4. A senha VELHA precisa parar de funcionar...
    const comVelha = await request.post(`${API_URL}/api/auth/login`, {
      headers: { 'x-tenant-slug': loja.slug },
      data: { email: loja.email, password: SENHA },
    });
    expect(comVelha.status(), 'a senha antiga tem que ser recusada').toBe(401);

    // 5. ...e a nova, funcionar na tela de login.
    await page.goto('/login');
    await page.getByPlaceholder('ex: autopecas-silva').fill(loja.slug);
    await page.locator('input[type=email]').fill(loja.email);
    await page.locator('input[type=password]').fill(NOVA_SENHA);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText(/visão geral/i)).toBeVisible();
  });

  test('o mesmo link não serve duas vezes', async ({ page, request }) => {
    const loja = await criarLoja(request);

    await request.post(`${API_URL}/api/auth/forgot-password`, {
      headers: { 'x-tenant-slug': loja.slug },
      data: { email: loja.email },
    });

    let link = '';
    await expect(async () => {
      const caixa = await (await request.get(`${MAILPIT}/api/v1/messages`)).json();
      const mensagem = caixa.messages.find((m: { To: { Address: string }[] }) =>
        m.To.some((d) => d.Address === loja.email),
      );
      expect(mensagem).toBeTruthy();
      const conteudo = await (await request.get(`${MAILPIT}/api/v1/message/${mensagem.ID}`)).json();
      link = conteudo.Text.match(/https?:\/\/\S*reset-password\S+/)[0];
    }).toPass({ timeout: 15_000 });

    // Primeiro uso: passa.
    await page.goto(link);
    await page.locator('input[type=password]').first().fill('PrimeiraTroca1');
    await page.locator('input[type=password]').last().fill('PrimeiraTroca1');
    await page.getByRole('button', { name: /salvar nova senha/i }).click();
    await expect(page.getByText(/senha alterada/i)).toBeVisible();

    // Segundo uso do MESMO link: precisa recusar. Um link de redefinição que
    // continua valendo é uma chave da conta esquecida na caixa de e-mail.
    await page.goto(link);
    await page.locator('input[type=password]').first().fill('SegundaTroca2');
    await page.locator('input[type=password]').last().fill('SegundaTroca2');
    await page.getByRole('button', { name: /salvar nova senha/i }).click();
    await expect(page.getByText(/inválido ou expirado/i)).toBeVisible();
  });
});
