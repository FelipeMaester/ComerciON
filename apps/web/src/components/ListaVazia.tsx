import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icone, type NomeDoIcone } from './Icone';

interface Props {
  icone: NomeDoIcone;
  titulo: string;
  /** Por que está vazio, ou o que fazer a respeito. Uma frase. */
  descricao?: string;
  /** O botão que resolve. Sem ele, a tela é um beco. */
  acao?: { rotulo: string; href?: string; aoClicar?: () => void };
  /** Colunas da tabela, quando a lista vazia mora dentro de um <tbody>. */
  colunas?: number;
}

/**
 * O que a lista mostra quando não tem nada.
 *
 * Vinte tabelas terminavam num texto cinza — "Nenhum produto encontrado." — e
 * paravam ali. Para quem acabou de criar a loja, o sistema inteiro é uma
 * sequência de becos: a tela diz que está vazio e não diz o que fazer.
 *
 * A diferença entre um estado vazio e um beco é o botão. Ele não é enfeite: é
 * a única saída visível de quem chegou naquela tela sem dado nenhum.
 *
 * Também distingue "vazio" de "sem resultado de busca" — são situações
 * diferentes e a resposta certa é diferente: numa cabe "cadastre o primeiro",
 * na outra cabe "tente outro termo".
 */
export function ListaVazia({ icone, titulo, descricao, acao, colunas }: Props) {
  const conteudo = (
    <div className="estado-vazio">
      <Icone nome={icone} />
      <p className="font-medium text-suave">{titulo}</p>
      {descricao && <p className="max-w-sm">{descricao}</p>}
      {acao &&
        (acao.href ? (
          <Link href={acao.href} className="btn-primary btn-sm mt-1.5">
            {acao.rotulo}
          </Link>
        ) : (
          <button type="button" onClick={acao.aoClicar} className="btn-primary btn-sm mt-1.5">
            {acao.rotulo}
          </button>
        ))}
    </div>
  );

  // Dentro de uma tabela precisa ser uma linha, senão o HTML fica inválido e o
  // navegador move o bloco para fora do <table> — some da tela.
  if (colunas) {
    return (
      <tr>
        <td colSpan={colunas} className="p-0">
          {conteudo}
        </td>
      </tr>
    );
  }

  return conteudo;
}

/** Quando a busca não achou nada — diferente de a lista estar vazia. */
export function BuscaSemResultado({ termo, colunas }: { termo: string; colunas?: number }): ReactNode {
  return (
    <ListaVazia
      icone="relatorio"
      titulo={`Nada encontrado para “${termo}”.`}
      descricao="Confira a grafia ou tente parte do nome."
      colunas={colunas}
    />
  );
}
