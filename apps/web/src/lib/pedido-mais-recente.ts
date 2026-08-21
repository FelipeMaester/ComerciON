import { useCallback, useRef } from 'react';

/**
 * Faz a última resposta valer, não a que chegar por último.
 *
 * Toda tela de lista termina o carregamento em `setAlgumaCoisa(await api.get(…))`,
 * sem ninguém conferir se aquele ainda é o pedido mais recente. Enquanto só
 * houver um pedido no ar, tudo bem. Mas o lojista abre Produtos, digita a peça
 * e aperta Buscar antes de a primeira lista chegar — e aí são dois. Se a
 * primeira demorar mais que a segunda, ela chega depois e sobrescreve: o
 * resultado da busca some, o catálogo inteiro volta, e o termo continua escrito
 * no campo. A tela passa a contradizer o próprio formulário, e quem está no
 * balcão não tem como saber qual das duas é a verdade.
 *
 * Some sozinho na máquina do desenvolvedor, onde o servidor responde em
 * milissegundos, e aparece na loja, na conexão da loja. Foi assim que apareceu:
 * dois testes que passavam sozinhos e reprovavam na suíte cheia, onde tudo
 * corre mais devagar.
 *
 * Uso:
 *
 * ```ts
 * const novoPedido = usePedidoMaisRecente();
 *
 * async function load() {
 *   const aindaVale = novoPedido();
 *   const dados = await api.get(…);
 *   if (!aindaVale()) return;   // outro pedido saiu depois deste
 *   setItens(dados.items);
 * }
 * ```
 *
 * Cancelar o pedido antigo com `AbortController` seria a outra saída, e
 * economizaria a resposta que vai ser descartada. Não foi a escolhida porque
 * obrigaria a mexer no cliente de API inteiro para repassar o `signal`; aqui a
 * mudança cabe dentro de cada `load`, e o efeito visível para o lojista é o
 * mesmo.
 */
export function usePedidoMaisRecente() {
  const ultimo = useRef(0);

  return useCallback(() => {
    const meu = ++ultimo.current;
    return () => meu === ultimo.current;
  }, []);
}
