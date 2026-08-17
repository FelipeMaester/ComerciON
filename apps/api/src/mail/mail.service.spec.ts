import { ConfigService } from '@nestjs/config';
import { MailMessage } from './mail-provider.interface';
import { MailService } from './mail.service';

describe('MailService', () => {
  let enviadas: MailMessage[];
  let service: MailService;

  function build(webAppUrl = 'http://localhost:3000') {
    enviadas = [];
    const provider = {
      send: async (m: MailMessage) => void enviadas.push(m),
      diagnosticar: async () => ({ ok: true, provedor: 'stub' as const }),
    };
    const config = { get: (key: string, def?: string) => (key === 'WEB_APP_URL' ? webAppUrl : def) };
    return new MailService(provider, config as unknown as ConfigService);
  }

  beforeEach(() => {
    service = build();
  });

  const params = {
    to: 'maria@loja.com.br',
    userName: 'Maria',
    tenantName: 'Loja Demo',
    tenantSlug: 'demo',
    token: 'abc-123.segredo',
  };

  describe('sendPasswordReset', () => {
    it('monta o link com token e slug da empresa', async () => {
      await service.sendPasswordReset(params);

      const [msg] = enviadas;
      expect(msg.to).toBe('maria@loja.com.br');
      // O slug precisa ir junto: a rota de redefinição é pública e sem ele a
      // API não sabe em qual empresa procurar o token.
      expect(msg.text).toContain('http://localhost:3000/reset-password?token=abc-123.segredo&tenant=demo');
    });

    it('escapa caracteres especiais do token na URL', async () => {
      await service.sendPasswordReset({ ...params, token: 'a+b/c=d' });
      expect(enviadas[0].text).toContain('token=a%2Bb%2Fc%3Dd');
    });

    it('não duplica a barra quando WEB_APP_URL termina com /', async () => {
      service = build('https://painel.loja.com.br/');
      await service.sendPasswordReset(params);
      expect(enviadas[0].text).toContain('https://painel.loja.com.br/reset-password?');
      expect(enviadas[0].text).not.toContain('.br//reset-password');
    });

    it('sempre manda versão em texto puro, não só HTML', async () => {
      // Cliente de e-mail sem HTML e filtro de spam olham o text/plain.
      await service.sendPasswordReset(params);
      expect(enviadas[0].text.length).toBeGreaterThan(0);
      expect(enviadas[0].html).toContain('<a href=');
    });

    it('escapa HTML no nome para um nome com < não quebrar (nem injetar) o corpo', async () => {
      await service.sendPasswordReset({ ...params, userName: '<script>alert(1)</script>' });
      expect(enviadas[0].html).not.toContain('<script>');
      expect(enviadas[0].html).toContain('&lt;script&gt;');
    });

    it('diz o prazo de validade, batendo com o TTL usado pelo AuthService', async () => {
      await service.sendPasswordReset(params);
      expect(enviadas[0].text).toContain(`${MailService.PASSWORD_RESET_TTL_MINUTES} minutos`);
    });
  });

  describe('sendPasswordChanged', () => {
    it('avisa a troca e orienta quem não reconhece a ação', async () => {
      await service.sendPasswordChanged({ to: params.to, userName: 'Maria', tenantName: 'Loja Demo' });

      const [msg] = enviadas;
      expect(msg.subject).toContain('senha foi alterada');
      expect(msg.text).toContain('NÃO foi você');
    });
  });
});
