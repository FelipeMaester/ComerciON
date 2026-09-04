/**
 * Junta a lista que veio do servidor com o que foi criado aqui enquanto ela
 * vinha.
 *
 * O caso concreto: a tela de Produtos pede `/categories` ao abrir. Criar uma
 * categoria de dentro do formulário acrescenta a nova à lista em memória. Se a
 * resposta daquele primeiro pedido chegar depois disso, ela substitui o array
 * inteiro — e a categoria recém-criada, que o servidor ainda não conhecia
 * quando o pedido saiu, desaparece.
 *
 * O efeito visível é pior que o sumiço. O `<select>` é controlado e aponta para
 * um id que já não tem `<option>`; o navegador mostra "Sem categoria", e a
 * pessoa salva a peça sem categoria nenhuma achando que escolheu uma.
 *
 * Some na máquina rápida e aparece sob carga. Foi assim que apareceu: uma
 * falha isolada numa execução cheia da suíte, passando quando rodada sozinha.
 *
 * Diferente de `usePedidoMaisRecente`, que resolve duas RESPOSTAS fora de
 * ordem: aqui a corrida é entre uma resposta e uma alteração local, e descartar
 * a resposta atrasada não bastaria — ela traz o resto da lista, que continua
 * válido. O que não pode é ela levar junto o que nasceu depois.
 */
export function semPerderOsNovos<T extends { id: string }>(doServidor: T[], atuais: T[]): T[] {
  const idsDoServidor = new Set(doServidor.map((item) => item.id));
  const criadosAqui = atuais.filter((item) => !idsDoServidor.has(item.id));

  // Sem nada local pendente, devolve a lista do servidor intacta — o caso
  // comum não paga por um caso raro.
  return criadosAqui.length === 0 ? doServidor : [...doServidor, ...criadosAqui];
}
