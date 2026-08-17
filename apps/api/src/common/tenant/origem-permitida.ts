import { slugDoHost } from './slug-do-host';

/**
 * Decide se uma origem pode falar com a API.
 *
 * Duas formas de passar:
 *   1. Ser exatamente a origem configurada em CORS_ORIGIN.
 *   2. Ser o painel de uma loja: mesmo protocolo e porta da origem
 *      configurada, e um subdomínio válido do domínio-base.
 *
 * O protocolo e a porta vêm da origem configurada, e não são livres, porque
 * `https://oficina.painel.x.com.br` e `http://oficina.painel.x.com.br` são
 * origens diferentes — aceitar as duas abriria a porta para uma página
 * servida sem TLS conversar com a API com credencial.
 */
export function origemPermitida(
  origem: string,
  origemConfigurada: string,
  dominioBase: string | undefined | null,
): boolean {
  if (origem === origemConfigurada) return true;
  if (!dominioBase) return false;

  let alvo: URL;
  let referencia: URL;
  try {
    alvo = new URL(origem);
    referencia = new URL(origemConfigurada);
  } catch {
    return false;
  }

  if (alvo.protocol !== referencia.protocol || alvo.port !== referencia.port) return false;

  // slugDoHost já recusa domínio de terceiro, mais de um nível de subdomínio
  // e prefixo que não parece identificador de loja.
  return slugDoHost(alvo.hostname, dominioBase) !== null;
}
