import { SmtpMailProvider } from './smtp-mail.provider';

/**
 * Estes testes falam com um servidor SMTP DE VERDADE (Mailpit), porque o que
 * interessa aqui é o comportamento de rede: conectar, autenticar, desistir a
 * tempo. Com o nodemailer mockado, nada disso seria exercitado.
 *
 * Sem Mailpit no ar, são pulados — falha vermelha por infraestrutura ausente
 * treina o time a ignorar a suíte.
 */
const MAILPIT = { host: 'localhost', port: 1025 };

async function mailpitNoAr(): Promise<boolean> {
  try {
    const r = await fetch('http://localhost:8025/api/v1/messages', { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

describe('SmtpMailProvider', () => {
  let disponivel = false;
  beforeAll(async () => {
    disponivel = await mailpitNoAr();
  });

  function provider(over: Partial<{ host: string; port: number }> = {}) {
    return new SmtpMailProvider({
      host: over.host ?? MAILPIT.host,
      port: over.port ?? MAILPIT.port,
      secure: false,
      from: 'ComerciON <teste@comercion.local>',
    });
  }

  it('diagnostica servidor no ar como ok', async () => {
    if (!disponivel) return;
    await expect(provider().diagnosticar()).resolves.toEqual({ ok: true, provedor: 'smtp' });
  });

  it('envia de verdade', async () => {
    if (!disponivel) return;
    await expect(
      provider().send({ to: 'destino@teste.local', subject: 'Teste', text: 'corpo' }),
    ).resolves.toBeUndefined();
  });

  it('DESISTE rápido quando o destino não responde, em vez de pendurar a requisição', async () => {
    // Cenário real e comum: VPS com a saída na porta 587 bloqueada pelo
    // provedor. O pacote é descartado em silêncio e a conexão fica aberta.
    // Sem timeout, o padrão do nodemailer espera dois minutos — e o usuário
    // fica olhando uma tela travada em "esqueci minha senha".
    //
    // 10.0.0.0/8 com porta improvável: não recusa, simplesmente não responde.
    const inicio = Date.now();
    const resultado = await provider({ host: '10.255.255.1', port: 2525 }).diagnosticar();
    const levou = Date.now() - inicio;

    expect(resultado.ok).toBe(false);
    expect(levou).toBeLessThan(20_000);
  }, 30_000);
});
