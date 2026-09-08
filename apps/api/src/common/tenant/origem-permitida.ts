import { slugDoHost } from './slug-do-host';
import { ehEnderecoDeRedeLocal } from './rede-local';

/**
 * Decide se uma origem pode falar com a API.
 *
 * Três formas de passar:
 *   1. Ser exatamente a origem configurada em CORS_ORIGIN.
 *   2. Ser o painel de uma loja: mesmo protocolo e porta da origem
 *      configurada, e um subdomínio válido do domínio-base.
 *   3. No modo rede local, ser um endereço de rede privada na mesma porta
 *      da origem configurada — a instalação de balcão, onde o IP da máquina
 *      muda com o DHCP e uma origem fixa quebraria sozinha.
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
  redeLocal = false,
): boolean {
  if (origem === origemConfigurada) return true;

  let alvo: URL;
  let referencia: URL;
  try {
    alvo = new URL(origem);
    referencia = new URL(origemConfigurada);
  } catch {
    return false;
  }

  // Rede local: mesma porta do painel configurado e endereço privado. A porta
  // continua presa para o modo não virar permissão para qualquer serviço da
  // máquina falar com a API com credencial.
  if (redeLocal && alvo.port === referencia.port && ehEnderecoDeRedeLocal(alvo.hostname)) {
    return true;
  }

  if (!dominioBase) return false;

  if (alvo.protocol !== referencia.protocol || alvo.port !== referencia.port) return false;

  // slugDoHost já recusa domínio de terceiro, mais de um nível de subdomínio
  // e prefixo que não parece identificador de loja.
  return slugDoHost(alvo.hostname, dominioBase) !== null;
}
