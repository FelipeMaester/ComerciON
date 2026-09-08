/**
 * O modo "rede local": o sistema atendendo os computadores da própria loja,
 * sem HTTPS.
 *
 * Existe para a instalação de balcão, onde não há domínio nem certificado —
 * a loja tem dois caixas na mesma rede e os dois precisam abrir o sistema.
 *
 * É uma REDUÇÃO DE SEGURANÇA consciente, e por isso é explícita: sem HTTPS a
 * senha trafega em texto claro dentro da rede da loja, e quem estiver no
 * mesmo wi-fi consegue lê-la. Aceitável numa rede de loja com senha; não
 * aceitável em rede aberta, e nunca na internet.
 *
 * O que ela muda, e por quê:
 *
 *   1. O cookie de sessão deixa de ser `Secure`. O navegador abre exceção
 *      para `http://localhost`, mas NÃO para `http://192.168.0.10` — sem
 *      isto, o outro computador carregaria a tela de login, a pessoa
 *      digitaria a senha e nada aconteceria, sem erro nenhum.
 *   2. O CORS passa a aceitar origens de rede privada, e não uma só. O IP da
 *      máquina muda com o DHCP, e uma origem fixa quebraria no dia em que o
 *      roteador reiniciasse.
 */
export function modoRedeLocal(valor: string | undefined | null): boolean {
  return valor === 'true';
}

/**
 * O endereço é de rede privada (RFC 1918) ou da própria máquina?
 *
 * A lista é fechada de propósito: qualquer nome que não seja um IP privado
 * ou localhost fica de fora, inclusive nome de domínio. Isso impede que o
 * modo de rede local vire, por descuido, permissão para a internet.
 */
export function ehEnderecoDeRedeLocal(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') {
    return true;
  }

  const partes = hostname.split('.');
  if (partes.length !== 4) return false;
  const octetos = partes.map((p) => Number(p));
  if (octetos.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

  const [a, b] = octetos;
  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 — as três faixas privadas.
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}
