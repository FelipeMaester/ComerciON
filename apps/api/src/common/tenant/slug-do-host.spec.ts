import { slugDoHost } from './slug-do-host';

describe('slugDoHost', () => {
  const BASE = 'painel.minhaloja.com.br';

  it('extrai o identificador do subdomínio', () => {
    expect(slugDoHost('oficina-do-ze.painel.minhaloja.com.br', BASE)).toBe('oficina-do-ze');
  });

  it('ignora a porta', () => {
    expect(slugDoHost('oficina.localhost:3000', 'localhost')).toBe('oficina');
  });

  it('não confunde maiúsculas', () => {
    expect(slugDoHost('Oficina.Painel.MinhaLoja.com.br', BASE)).toBe('oficina');
  });

  it('o domínio-base puro não é loja nenhuma', () => {
    // É o endereço onde a tela de login pede o identificador. Tratá-lo como
    // loja chamada "painel" faria a página principal procurar um tenant que
    // não existe.
    expect(slugDoHost(BASE, BASE)).toBeNull();
  });

  it('recusa host de outro domínio', () => {
    // Um Host forjado não pode virar consulta de tenant.
    expect(slugDoHost('oficina.dominio-de-outra-pessoa.com', BASE)).toBeNull();
    expect(slugDoHost('painel.minhaloja.com.br.atacante.com', BASE)).toBeNull();
  });

  it('recusa mais de um nível de subdomínio', () => {
    // Com "a.b.painel.x", escolher "a" ou "b" seria chute; recusar é o único
    // comportamento defensável.
    expect(slugDoHost('a.b.painel.minhaloja.com.br', BASE)).toBeNull();
  });

  it('recusa prefixo que não parece identificador', () => {
    expect(slugDoHost('-oficina.painel.minhaloja.com.br', BASE)).toBeNull();
    expect(slugDoHost('ofi_cina.painel.minhaloja.com.br', BASE)).toBeNull();
    expect(slugDoHost('oficina!.painel.minhaloja.com.br', BASE)).toBeNull();
  });

  it('sem domínio-base configurado, não resolve nada', () => {
    // O padrão preserva o comportamento antigo: quem manda é o header.
    expect(slugDoHost('oficina.painel.minhaloja.com.br', undefined)).toBeNull();
    expect(slugDoHost('oficina.painel.minhaloja.com.br', '')).toBeNull();
  });

  it('aguenta host ausente ou vazio', () => {
    expect(slugDoHost(undefined, BASE)).toBeNull();
    expect(slugDoHost('', BASE)).toBeNull();
  });

  it('IP direto não vira loja', () => {
    expect(slugDoHost('192.168.0.10', BASE)).toBeNull();
    expect(slugDoHost('[::1]:3001', BASE)).toBeNull();
  });

  it('tolera ponto sobrando na configuração do domínio-base', () => {
    // '.painel.x.com.br' é um jeito natural de escrever, e falhar por isso
    // daria um erro sem pista nenhuma.
    expect(slugDoHost('oficina.painel.minhaloja.com.br', '.painel.minhaloja.com.br.')).toBe('oficina');
  });
});
