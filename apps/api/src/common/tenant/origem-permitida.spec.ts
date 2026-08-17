import { origemPermitida } from './origem-permitida';

describe('origemPermitida', () => {
  const CONFIGURADA = 'https://painel.minhaloja.com.br';
  const BASE = 'painel.minhaloja.com.br';

  it('aceita a origem configurada', () => {
    expect(origemPermitida(CONFIGURADA, CONFIGURADA, BASE)).toBe(true);
  });

  it('aceita o painel de uma loja', () => {
    expect(origemPermitida('https://oficina.painel.minhaloja.com.br', CONFIGURADA, BASE)).toBe(true);
  });

  it('recusa domínio de terceiro', () => {
    expect(origemPermitida('https://site-do-atacante.com', CONFIGURADA, BASE)).toBe(false);
    expect(origemPermitida('https://painel.minhaloja.com.br.atacante.com', CONFIGURADA, BASE)).toBe(false);
  });

  it('recusa o mesmo endereço sem TLS', () => {
    // Aceitar http deixaria uma página servida em claro conversar com a API
    // levando o cookie de sessão junto.
    expect(origemPermitida('http://oficina.painel.minhaloja.com.br', CONFIGURADA, BASE)).toBe(false);
  });

  it('recusa porta diferente', () => {
    expect(origemPermitida('https://oficina.painel.minhaloja.com.br:8443', CONFIGURADA, BASE)).toBe(false);
  });

  it('sem domínio-base, só a origem configurada passa', () => {
    expect(origemPermitida('https://oficina.painel.minhaloja.com.br', CONFIGURADA, undefined)).toBe(false);
    expect(origemPermitida(CONFIGURADA, CONFIGURADA, undefined)).toBe(true);
  });

  it('funciona em desenvolvimento, com porta', () => {
    expect(origemPermitida('http://oficina.localhost:3000', 'http://localhost:3000', 'localhost')).toBe(true);
    expect(origemPermitida('http://oficina.localhost:9999', 'http://localhost:3000', 'localhost')).toBe(false);
  });

  it('origem malformada não derruba a checagem', () => {
    expect(origemPermitida('null', CONFIGURADA, BASE)).toBe(false);
    expect(origemPermitida('nao-e-url', CONFIGURADA, BASE)).toBe(false);
  });
});
