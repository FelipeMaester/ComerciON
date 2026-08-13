import type { CookieOptions, Request, Response } from 'express';

/**
 * Sessão em cookie httpOnly.
 *
 * O que isso resolve: antes o token ficava em localStorage, legível por
 * qualquer JavaScript da página. Um XSS copiava o token e usava a sessão de
 * outra máquina, por quanto tempo o token durasse. Com httpOnly o script não
 * consegue LER o token — continua podendo fazer requisições enquanto a aba
 * está aberta (isso nenhum armazenamento evita), mas não consegue levar a
 * sessão embora.
 *
 * SameSite=Lax, e não None: o navegador considera painel.dominio.com.br e
 * api.dominio.com.br o MESMO site (o que conta é o domínio registrável), então
 * o cookie viaja normalmente entre os dois. Se o painel e a API forem parar em
 * domínios registráveis DIFERENTES, o cookie deixa de ser enviado e ninguém
 * entra — está avisado no .env.example.
 */

export const ACCESS_COOKIE = 'comercion_access';
export const REFRESH_COOKIE = 'comercion_refresh';

/**
 * Converte "15m" / "7d" / "12h" / "3600" no número de milissegundos, para o
 * cookie viver o mesmo tanto que o token que ele carrega.
 *
 * Se o formato for desconhecido devolve undefined, e o cookie vira de sessão
 * (morre ao fechar o navegador). É o lado seguro de errar: o pior caso é
 * pedir login de novo, nunca uma sessão que dura mais do que devia.
 */
export function duracaoEmMs(valor: string | undefined): number | undefined {
  if (!valor) return undefined;
  const match = /^(\d+)\s*([smhd])?$/i.exec(valor.trim());
  if (!match) return undefined;

  const quantidade = Number(match[1]);
  const unidade = (match[2] ?? 's').toLowerCase();
  const emMs: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return quantidade * emMs[unidade];
}

function opcoesBase(producao: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // Sem HTTPS em desenvolvimento o navegador descartaria um cookie Secure.
    secure: producao,
    path: '/',
  };
}

export interface ConfiguracaoCookie {
  producao: boolean;
  duracaoAccess?: string;
  duracaoRefresh?: string;
}

export function definirCookiesDeSessao(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  config: ConfiguracaoCookie,
): void {
  const base = opcoesBase(config.producao);
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: duracaoEmMs(config.duracaoAccess) });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: duracaoEmMs(config.duracaoRefresh) });
}

export function limparCookiesDeSessao(res: Response, producao: boolean): void {
  // As opções precisam bater com as da criação (path/sameSite/secure), senão
  // o navegador entende como outro cookie e o original continua lá.
  const base = opcoesBase(producao);
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
}

/**
 * Lê um cookie direto do header.
 *
 * Feito à mão de propósito: o cookie-parser existe só para popular
 * `req.cookies`, e é a única coisa que precisaríamos dele. `res.cookie()`, que
 * escreve, já vem do próprio Express.
 */
export function lerCookie(req: Request, nome: string): string | undefined {
  const cabecalho = req.headers?.cookie;
  if (!cabecalho) return undefined;

  for (const pedaco of cabecalho.split(';')) {
    const igual = pedaco.indexOf('=');
    if (igual === -1) continue;
    if (pedaco.slice(0, igual).trim() !== nome) continue;

    const valor = pedaco.slice(igual + 1).trim();
    try {
      return decodeURIComponent(valor);
    } catch {
      // Cookie com percent-encoding quebrado: tratar como ausente é melhor do
      // que derrubar a requisição inteira com um URIError.
      return undefined;
    }
  }
  return undefined;
}
