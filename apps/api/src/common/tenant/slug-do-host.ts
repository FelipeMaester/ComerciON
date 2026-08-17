/**
 * Extrai o identificador da loja a partir do endereço acessado.
 *
 * `oficina-do-ze.painel.minhaloja.com.br` → `oficina-do-ze`
 *
 * O domínio-base é CONFIGURADO (TENANT_BASE_DOMAIN), não adivinhado contando
 * rótulos. Contar seria frágil de um jeito perigoso: `minhaloja.com.br` tem
 * três rótulos igual a `oficina.localhost.dev`, e uma heurística acabaria
 * tratando "minhaloja" como nome de loja — servindo o tenant errado, ou
 * nenhum, no domínio principal. Com o domínio-base explícito só existe uma
 * leitura possível.
 *
 * Sem TENANT_BASE_DOMAIN configurado, devolve null e nada muda: o sistema
 * continua resolvendo a loja pelo header x-tenant-slug, como sempre fez.
 */

/** Mesmo formato aceito no cadastro da loja: minúsculas, números e hífen. */
const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]*$/;

/** O mínimo de uma requisição que interessa para descobrir a loja. */
export interface RequisicaoComOrigem {
  headers?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

/**
 * De onde sai o identificador da loja numa requisição SEM token.
 *
 * Está aqui, e não copiado no interceptor e no guard de módulos, porque os
 * dois precisam chegar exatamente à mesma loja. Enquanto era só o header,
 * duas cópias davam no mesmo; com o subdomínio entrando na conta, uma cópia
 * desatualizada faria o guard liberar (ou barrar) módulo de outro tenant.
 */
export function slugDaRequisicao(
  request: RequisicaoComOrigem,
  opcoes: { nomeDoHeader: string; dominioBase?: string | null },
): string | null {
  const doHost = slugDoHost(request.headers?.host as string | undefined, opcoes.dominioBase);
  if (doHost) return doHost;

  // Webhooks de provedor externo não permitem header customizado na URL — só
  // a query string. Por isso o ?tenant= continua valendo.
  const valor = request.headers?.[opcoes.nomeDoHeader] ?? request.query?.tenant;
  return valor ? String(valor) : null;
}

export function slugDoHost(host: string | undefined | null, dominioBase: string | undefined | null): string | null {
  if (!host || !dominioBase) return null;

  // Host vem com a porta em desenvolvimento (oficina.localhost:3000) e pode
  // vir com colchetes em IPv6 — nenhum dos dois faz parte do nome.
  const nome = host.trim().toLowerCase().split(':')[0].replace(/^\[|\]$/g, '');
  const base = dominioBase.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  if (!nome || !base) return null;

  // O domínio-base puro é o endereço "sem loja" — nele a tela de login pede o
  // identificador, como antes.
  if (nome === base) return null;

  const sufixo = `.${base}`;
  if (!nome.endsWith(sufixo)) return null;

  const prefixo = nome.slice(0, -sufixo.length);

  // Um ponto no prefixo significa mais de um nível (a.b.painel.x.com.br).
  // Não é uma loja: recusar é melhor do que escolher um dos lados.
  if (!prefixo || prefixo.includes('.')) return null;

  // Recusar o que não parece slug evita transformar lixo do header Host em
  // consulta ao banco a cada requisição.
  if (!SLUG_VALIDO.test(prefixo)) return null;

  return prefixo;
}
