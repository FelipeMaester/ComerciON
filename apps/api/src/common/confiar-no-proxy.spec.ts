import { confiarNoProxy } from './confiar-no-proxy';

/**
 * O padrão inseguro aqui não é "confiar demais", é confiar por engano: um
 * valor mal digitado no .env não pode acabar liberando o cliente a forjar o
 * próprio IP e furar o limite de login.
 */
describe('confiarNoProxy', () => {
  it('sem a variável, não confia em ninguém — API exposta direto é o caso padrão', () => {
    expect(confiarNoProxy(undefined)).toBe(false);
    expect(confiarNoProxy('')).toBe(false);
  });

  it('um proxy na frente (o Caddy) confia num salto só', () => {
    expect(confiarNoProxy('1')).toBe(1);
    expect(confiarNoProxy('true')).toBe(1);
    expect(confiarNoProxy(' TRUE ')).toBe(1);
  });

  it('desligar explicitamente também vale', () => {
    expect(confiarNoProxy('0')).toBe(false);
    expect(confiarNoProxy('false')).toBe(false);
  });

  it('mais de um salto, quando há CDN antes do proxy', () => {
    expect(confiarNoProxy('2')).toBe(2);
  });

  it('valor sem sentido não vira confiança — cai no padrão seguro', () => {
    expect(confiarNoProxy('sim, pode confiar')).toBe(false);
    expect(confiarNoProxy('-1')).toBe(false);
    expect(confiarNoProxy('1.5')).toBe(false);
    // "todos" era um valor aceito pelo Express (trust proxy: true = confia na
    // cadeia inteira); aqui não passa, porque confiar na cadeia inteira é
    // exatamente o que permite forjar o IP.
    expect(confiarNoProxy('todos')).toBe(false);
  });
});
