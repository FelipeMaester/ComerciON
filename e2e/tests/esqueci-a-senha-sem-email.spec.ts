import { expect, test } from '../fixtures';

/**
 * A tela de "esqueci minha senha" não pode prometer um e-mail que não sai.
 *
 * A resposta é vaga de propósito — "se este e-mail estiver cadastrado,
 * enviamos um link" — para a rota pública não virar uma forma de descobrir
 * quem tem conta na loja. Isso está certo e continua.
 *
 * O problema é outro: numa instalação com MAIL_PROVIDER=stub (o padrão de quem
 * acabou de subir o sistema), NADA é enviado — e a mesma tela ainda manda
 * conferir a caixa de spam. A pessoa procura por uma hora um e-mail que nunca
 * existiu, e não há segunda porta.
 *
 * Se o servidor manda e-mail ou não é característica da INSTALAÇÃO, igual para
 * todo mundo: dizer isso não revela nada sobre quem tem conta, e é a única
 * informação que tira a pessoa do lugar.
 *
 * O estado é forçado interceptando /health/mail: o ambiente de teste usa
 * mailpit e responde "enviando", então o caso que interessa nunca apareceria
 * sozinho.
 */
test.describe('esqueci minha senha, sem e-mail configurado', () => {
  async function abrirCom(page: import('@playwright/test').Page, corpo: unknown, status = 200) {
    await page.route(/\/health\/mail$/, (rota) =>
      rota.fulfill({ status, contentType: 'application/json', body: JSON.stringify(corpo) }),
    );
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'Esqueci minha senha' })).toBeVisible();
  }

  test('avisa que o link não vai chegar e diz o que fazer', async ({ page }) => {
    await abrirCom(page, { status: 'ok', ok: true, provedor: 'stub' });

    await expect(page.getByText(/não está configurado para enviar e-mail/i)).toBeVisible();
    // O aviso sem saída seria só uma má notícia. O que resolve é a segunda
    // porta: alguém com acesso de administrador define a senha na tela Usuários.
    await expect(page.getByText(/administrador/i)).toBeVisible();
  });

  test('depois de pedir, não manda procurar no spam o que não foi enviado', async ({ page, loja }) => {
    await abrirCom(page, { status: 'ok', ok: true, provedor: 'stub' });

    // A loja precisa existir: sem tenant, a API recusa o pedido e a tela
    // mostra erro em vez da confirmação. O e-mail é que pode ser qualquer um
    // — a resposta é a mesma exista ele ou não, que é o ponto da rota.
    await page.getByLabel('Empresa (identificador)').fill(loja.slug);
    await page.getByLabel('E-mail').fill('ninguem@exemplo.com');
    await page.getByRole('button', { name: 'Enviar link' }).click();

    await expect(page.getByText(/não conte com o e-mail/i)).toBeVisible();
    await expect(page.getByText(/caixa de spam/i)).toHaveCount(0);
  });

  test('e-mail configurado mas fora do ar também avisa', async ({ page }) => {
    // 503 é o que o próprio health check responde quando o SMTP está
    // configurado e não responde. Para quem está trancado do lado de fora, dá
    // no mesmo que não ter e-mail nenhum.
    await abrirCom(page, { status: 'degraded', ok: false, provedor: 'smtp' }, 503);

    await expect(page.getByText(/fora do ar/i)).toBeVisible();
  });

  test('com o e-mail funcionando, a tela não avisa nada', async ({ page }) => {
    // Controle. Sem ele, um aviso fixo no código passaria nos três testes
    // acima — que é exatamente o defeito que o aviso fiscal já teve.
    await abrirCom(page, { status: 'ok', ok: true, provedor: 'smtp' });

    await expect(page.getByText(/não está configurado para enviar e-mail/i)).toHaveCount(0);
    await expect(page.getByText(/fora do ar/i)).toHaveCount(0);
    // E a promessa normal continua: quem tem e-mail funcionando deve conferir o spam.
    await expect(page.getByText(/Enviaremos um link/i)).toBeVisible();
  });

  test('sem saber, a tela não afirma nada', async ({ page }) => {
    // A regra que o aviso fiscal ensinou: enquanto não sabe, não afirma. Um
    // health check fora do ar não pode fazer a tela dizer que o e-mail está.
    await abrirCom(page, {}, 500);

    await expect(page.getByText(/não está configurado para enviar e-mail/i)).toHaveCount(0);
    await expect(page.getByText(/fora do ar/i)).toHaveCount(0);
  });
});
