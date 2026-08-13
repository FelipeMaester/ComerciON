import type { Request } from 'express';
import { ACCESS_COOKIE, duracaoEmMs, lerCookie } from './auth-cookies';

function req(cookie?: string): Request {
  return { headers: cookie === undefined ? {} : { cookie } } as Request;
}

describe('duracaoEmMs', () => {
  it.each([
    ['15m', 15 * 60_000],
    ['7d', 7 * 86_400_000],
    ['12h', 12 * 3_600_000],
    ['30s', 30_000],
    // Sem unidade, a convenção do JWT é segundos.
    ['3600', 3_600_000],
  ])('converte %s', (entrada, esperado) => {
    expect(duracaoEmMs(entrada)).toBe(esperado);
  });

  it('devolve undefined para formato desconhecido, deixando o cookie ser de sessão', () => {
    // Errar para o lado curto é o certo: no pior caso pede login de novo.
    // Se caísse num padrão longo, uma configuração digitada errado viraria
    // sessão eterna sem ninguém perceber.
    expect(duracaoEmMs('para sempre')).toBeUndefined();
    expect(duracaoEmMs('')).toBeUndefined();
    expect(duracaoEmMs(undefined)).toBeUndefined();
  });
});

describe('lerCookie', () => {
  it('acha o cookie no meio dos outros', () => {
    expect(lerCookie(req(`tema=escuro; ${ACCESS_COOKIE}=abc.def.ghi; outro=1`), ACCESS_COOKIE)).toBe('abc.def.ghi');
  });

  it('não confunde um cookie cujo nome TERMINA igual', () => {
    // 'x_comercion_access' contém o nome procurado; casar por substring
    // devolveria o valor errado e a sessão simplesmente não funcionaria.
    expect(lerCookie(req(`x_${ACCESS_COOKIE}=intruso`), ACCESS_COOKIE)).toBeUndefined();
  });

  it('devolve undefined quando não há cookie nenhum', () => {
    expect(lerCookie(req(), ACCESS_COOKIE)).toBeUndefined();
    expect(lerCookie(req(''), ACCESS_COOKIE)).toBeUndefined();
  });

  it('aguenta percent-encoding quebrado sem derrubar a requisição', () => {
    expect(lerCookie(req(`${ACCESS_COOKIE}=%E0%A4%A`), ACCESS_COOKIE)).toBeUndefined();
  });

  it('decodifica valor com percent-encoding válido', () => {
    expect(lerCookie(req(`${ACCESS_COOKIE}=a%20b`), ACCESS_COOKIE)).toBe('a b');
  });
});
