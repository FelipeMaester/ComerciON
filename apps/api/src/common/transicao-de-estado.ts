import { BadRequestException } from '@nestjs/common';

/**
 * Reivindica uma mudança de estado, em vez de conferir e depois gravar.
 *
 * O padrão que isto substitui aparecia em todo o sistema: ler a linha,
 * comparar o status em JavaScript, e só então gravar o novo status. No
 * isolamento padrão do Postgres (Read Committed) duas requisições
 * simultâneas leem as duas o status antigo, passam as duas pela conferência
 * e executam as duas os efeitos — venda confirmada cinco vezes, estoque
 * baixado cinco vezes, cinco lançamentos financeiros para uma venda só.
 *
 * A forma correta é pôr a condição DENTRO do UPDATE:
 *
 *   UPDATE vendas SET status = 'CONFIRMED' WHERE id = ? AND status = 'QUOTE'
 *
 * Quem chega depois espera a trava de linha da primeira, reavalia a condição
 * contra o valor já comitado e afeta zero linhas — e é essa que recebe o
 * erro. Como bônus, o UPDATE trava a linha até o fim da transação, então os
 * efeitos colaterais que vêm depois (baixa de estoque, pagamento, contas a
 * receber) rodam serializados de verdade.
 *
 * Por isso a reivindicação vem SEMPRE antes dos efeitos, nunca depois.
 *
 * @param operacao um `updateMany` com o estado esperado no `where`
 * @param mensagem o que dizer a quem perdeu a corrida (ou tentou fora de hora)
 */
export async function exigirTransicao(operacao: Promise<{ count: number }>, mensagem: string): Promise<void> {
  const { count } = await operacao;
  if (count === 0) throw new BadRequestException(mensagem);
}
