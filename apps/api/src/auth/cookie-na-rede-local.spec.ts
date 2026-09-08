import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { ConfigService } from '@nestjs/config';

/**
 * O cookie de sessão no modo rede local.
 *
 * Esta é a falha mais traiçoeira desta configuração inteira, e por isso tem
 * teste próprio: o navegador ACEITA cookie `Secure` em `http://localhost` —
 * é uma exceção da especificação — mas DESCARTA em `http://192.168.0.10`.
 *
 * Com o cookie marcado Secure e o painel aberto pelo IP, o computador do
 * outro balcão carregaria a tela de login, a pessoa digitaria a senha certa,
 * o servidor responderia 200, e a tela simplesmente voltaria para o login.
 * Sem erro na tela, sem erro no log, sem nada para procurar. Testar em
 * localhost — que é onde quem desenvolve testa — não revelaria nada.
 */
describe('cookie de sessão no modo rede local', () => {
  function controlador(env: Record<string, string | undefined>) {
    const config = { get: (chave: string) => env[chave] } as unknown as ConfigService;
    return new AuthController({} as AuthService, config);
  }

  /** O getter é privado; o teste chega nele pelo mesmo caminho que o código. */
  function cookieDe(controller: AuthController) {
    return (controller as unknown as { configCookie: { producao: boolean } }).configCookie;
  }

  it('em produção com HTTPS, o cookie vai Secure', () => {
    expect(cookieDe(controlador({ NODE_ENV: 'production' })).producao).toBe(true);
  });

  it('em produção com modo rede local, o cookie NÃO vai Secure', () => {
    expect(
      cookieDe(controlador({ NODE_ENV: 'production', MODO_REDE_LOCAL: 'true' })).producao,
    ).toBe(false);
  });

  it('em desenvolvimento continua sem Secure, como sempre foi', () => {
    expect(cookieDe(controlador({ NODE_ENV: 'development' })).producao).toBe(false);
  });

  /**
   * O contrário do risco: uma variável mal escrita no .env de produção não
   * pode desligar o Secure sem querer.
   */
  it('valor que não seja "true" exato não desliga o Secure', () => {
    for (const valor of ['TRUE', '1', 'sim', 'false', '']) {
      expect(
        cookieDe(controlador({ NODE_ENV: 'production', MODO_REDE_LOCAL: valor })).producao,
      ).toBe(true);
    }
  });
});
