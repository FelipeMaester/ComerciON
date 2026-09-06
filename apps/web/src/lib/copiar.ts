/**
 * Copia um texto para a área de transferência, funcionando fora de HTTPS.
 *
 * POR QUE ISTO EXISTE
 * `navigator.clipboard` só existe em contexto seguro: HTTPS ou localhost. Uma
 * loja que abre o sistema de outro computador do balcão — `http://192.168.x.x`,
 * que é exatamente o cenário do pacote para Windows — não tem a API. O objeto é
 * `undefined`, e `navigator.clipboard.writeText(...)` estoura um TypeError.
 *
 * Duas das três telas que copiam já tratavam a falha, com a razão escrita no
 * código ("acontece fora de HTTPS"). A terceira, a do link público do
 * orçamento, ficou para trás: o clique estourava e morria em silêncio — nem
 * "Copiado!", nem aviso de erro. É o mesmo formato do defeito do botão Excluir,
 * que chegou por relato de quem usava: clica e não acontece nada.
 *
 * O caminho antigo (`execCommand`) está obsoleto, mas funciona onde o novo nem
 * existe. Usá-lo como reserva não é apego ao passado: é a diferença entre
 * copiar e não copiar no computador da loja.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  // Caminho moderno, quando o navegador o oferece.
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // Existe mas foi negada (permissão, aba sem foco). Cai para a reserva.
    }
  }

  if (typeof document === 'undefined') return false;

  // Reserva: um campo fora da tela, selecionado e copiado pelo caminho antigo.
  const campo = document.createElement('textarea');
  campo.value = texto;
  // `fixed` e opacidade zero para o navegador não rolar a página até ele.
  campo.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
  campo.setAttribute('readonly', '');
  campo.setAttribute('aria-hidden', 'true');
  document.body.appendChild(campo);

  try {
    campo.select();
    campo.setSelectionRange(0, texto.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(campo);
  }
}
