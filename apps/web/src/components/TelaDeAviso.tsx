import Link from 'next/link';

/**
 * O layout comum das telas de beco sem saída: 404 e erro.
 *
 * Existe para as duas serem a mesma coisa visualmente. Quando o sistema falha,
 * o pior é a tela também deixar de parecer o sistema: a pessoa não sabe se
 * perdeu a sessão, se digitou o endereço errado ou se a loja saiu do ar.
 *
 * Sempre com saída. Uma tela que informa e não oferece caminho força o
 * caminho ruim — apertar F5 até cansar, ou fechar tudo e entrar de novo.
 */
export function TelaDeAviso({
  codigo,
  titulo,
  descricao,
  acao,
  detalhe,
}: {
  /** O número grande, quando existe um (404). */
  codigo?: string;
  titulo: string;
  descricao: string;
  /** Ação principal: um botão que faz algo ou um link para outra tela. */
  acao: React.ReactNode;
  /** Informação técnica para o suporte, quando houver. Nunca é o texto principal. */
  detalhe?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo p-6">
      <div className="w-full max-w-md text-center">
        {codigo && (
          <p className="mb-2 text-6xl font-semibold tracking-tight text-marca-legivel" aria-hidden>
            {codigo}
          </p>
        )}
        <h1 className="titulo-pagina">{titulo}</h1>
        <p className="mt-2 text-sm leading-relaxed text-suave">{descricao}</p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{acao}</div>

        {detalhe && (
          // Código de referência, não explicação: quem lê isto está ligando
          // para o suporte, e o suporte precisa de algo para procurar no log.
          <p className="mt-6 font-mono text-xs text-tenue">Código para o suporte: {detalhe}</p>
        )}

        <p className="mt-8 text-xs text-tenue">
          ComerciON ·{' '}
          <Link href="/dashboard" className="hover:underline">
            painel
          </Link>
        </p>
      </div>
    </main>
  );
}
