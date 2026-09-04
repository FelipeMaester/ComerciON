import { API_URL, api, expect, test } from '../fixtures';

/**
 * Quando o e-mail não chega, alguém precisa poder destravar a pessoa.
 *
 * Até aqui a ÚNICA forma de recuperar uma senha era o link enviado por e-mail.
 * E e-mail falha de mais jeitos do que o sistema enxerga: MAIL_PROVIDER=stub
 * numa instalação recém-feita (a tela diz "enviamos um link" sem mandar nada),
 * endereço errado no cadastro, caixa desativada pela empresa, mensagem no spam
 * de um servidor que ninguém administra.
 *
 * Em qualquer um desses casos a pessoa ficava trancada do lado de fora sem
 * NENHUMA saída pela interface — a solução era mexer no banco de dados. Numa
 * loja que instalou o sistema sozinha, isso não é uma solução.
 */
test.describe('senha definida pelo administrador', () => {
  const SENHA_ANTIGA = 'SenhaAntiga1';
  const SENHA_NOVA = 'SenhaNova2';

  /** Login pela API, para conferir o que a senha abre e o que deixou de abrir. */
  async function entrar(
    request: Parameters<typeof api>[0],
    slug: string,
    email: string,
    senha: string,
  ) {
    return request.post(`${API_URL}/api/auth/login`, {
      headers: { 'x-tenant-slug': slug },
      data: { email, password: senha },
    });
  }

  test('a senha nova entra, a antiga não, e a sessão aberta cai', async ({
    paginaLogada: page,
    request,
    loja,
  }) => {
    const email = `rita@${loja.slug}.teste`;
    await api(request, loja, 'post', '/users', {
      name: 'Rita Vendedora',
      email,
      password: SENHA_ANTIGA,
      role: 'SALES',
    });

    // Rita entra e fica com a sessão aberta — é o cenário em que a conta foi
    // tomada: quem trocou a senha precisa derrubar quem já estava dentro.
    const antes = await entrar(request, loja.slug, email, SENHA_ANTIGA);
    expect(antes.ok(), 'a senha original deveria entrar').toBeTruthy();
    const { refreshToken } = await antes.json();

    await page.goto('/users');
    await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible();

    const linha = page.getByRole('row', { name: /Rita Vendedora/ });
    await linha.getByRole('button', { name: 'Definir senha' }).click();
    await page.getByLabel('Nova senha de Rita Vendedora').fill(SENHA_NOVA);
    await page.getByRole('button', { name: 'Salvar senha' }).click();

    await expect(page.getByText(/Senha definida para Rita Vendedora/)).toBeVisible();

    // A sessão que Rita já tinha aberta precisa morrer junto: trocar a senha
    // sem revogar o refresh token deixaria um invasor logado do mesmo jeito.
    //
    // Vem ANTES do login com a senha nova de propósito. O refresh token é um
    // JWT assinado sobre o mesmo payload, e dois logins no mesmo segundo saem
    // idênticos — logar de novo primeiro cria uma linha válida com o MESMO
    // texto, e a renovação passaria mesmo com a revogação funcionando. Foi
    // assim que esta asserção falhou na primeira versão.
    const renovacao = await request.post(`${API_URL}/api/auth/refresh`, {
      headers: { 'x-tenant-slug': loja.slug, Cookie: `comercion_refresh=${refreshToken}` },
      data: { refreshToken },
    });
    expect(renovacao.ok(), 'a sessão aberta antes da troca deveria ter caído').toBeFalsy();

    const comANova = await entrar(request, loja.slug, email, SENHA_NOVA);
    expect(comANova.ok(), 'a senha nova deveria entrar').toBeTruthy();

    // Controle: sem isto, o teste passaria mesmo se a rota não tivesse trocado
    // nada — a senha nova entrando não prova que a antiga parou de entrar.
    const comAAntiga = await entrar(request, loja.slug, email, SENHA_ANTIGA);
    expect(comAAntiga.ok(), 'a senha antiga não podia mais entrar').toBeFalsy();
  });

  test('na própria linha o botão não aparece', async ({ paginaLogada: page, request, loja }) => {
    // Trocar a própria senha continua exigindo a senha atual, em Preferências.
    // Sem isso, quem pegasse uma sessão de administrador aberta trocaria a
    // senha sem conhecê-la e trancaria o dono para fora da própria loja.
    await api(request, loja, 'post', '/users', {
      name: 'Rita Vendedora',
      email: `rita@${loja.slug}.teste`,
      password: SENHA_ANTIGA,
      role: 'SALES',
    });

    await page.goto('/users');

    const minhaLinha = page.getByRole('row', { name: new RegExp(loja.email) });
    await expect(minhaLinha).toBeVisible();
    await expect(minhaLinha.getByRole('button', { name: 'Definir senha' })).toHaveCount(0);

    // Controle: o botão EXISTE na tela — só não na minha linha. Sem isto, o
    // teste passaria se a funcionalidade inteira tivesse sumido.
    const linhaDaRita = page.getByRole('row', { name: /Rita Vendedora/ });
    await expect(linhaDaRita.getByRole('button', { name: 'Definir senha' })).toHaveCount(1);
  });
});