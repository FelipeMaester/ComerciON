'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TelaDeAviso } from '@/components/TelaDeAviso';

/**
 * Quando uma tela quebra de verdade.
 *
 * Sem este arquivo, um erro de render derruba a página inteira para a tela
 * padrão do Next — em produção, um "Application error: a client-side exception
 * has occurred" sem nada em volta. Quem está no balcão com um cliente esperando
 * lê isso e conclui que o sistema morreu; e não há botão nenhum para tentar de
 * novo, só o F5.
 *
 * `reset()` é o que muda o jogo: refaz o render daquele trecho SEM recarregar a
 * página. Numa falha passageira (a rede oscilou no meio de uma busca), a pessoa
 * volta ao trabalho sem perder o que estava fazendo em outra aba do navegador.
 *
 * O texto não repete a mensagem técnica do erro: ela quase nunca ajuda quem
 * está usando e às vezes revela detalhe interno. O `digest` fica como código de
 * referência — é ele que o suporte procura no log do servidor.
 */
export default function ErroDeTela({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // O console é o que sobra para quem for investigar depois no navegador de
    // quem reclamou. O erro nunca vai para a tela.
    // eslint-disable-next-line no-console
    console.error('Erro na tela:', error);
  }, [error]);

  // Mesmo motivo do error.tsx do painel: o limite de erro não se desfaz
  // sozinho ao trocar de rota, e sem isto sair desta tela leva ao erro
  // global em vez de à tela pedida.
  const pathname = usePathname();
  const ondeQuebrou = useRef(pathname);

  useEffect(() => {
    if (pathname !== ondeQuebrou.current) reset();
  }, [pathname, reset]);

  return (
    <TelaDeAviso
      titulo="Esta tela não carregou"
      descricao="Alguma coisa falhou aqui dentro — não foi você. Tentar de novo costuma resolver; se insistir, o painel continua funcionando nas outras telas."
      detalhe={error.digest}
      acao={
        <>
          <button onClick={reset} className="btn-primary">
            Tentar de novo
          </button>
          <Link href="/dashboard" className="btn-secondary">
            Ir para o painel
          </Link>
        </>
      }
    />
  );
}
