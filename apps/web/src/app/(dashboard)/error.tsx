'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Erro dentro do painel, sem perder o painel.
 *
 * O `error.tsx` da raiz troca a tela inteira. Aqui dentro isso seria exagero e
 * um empurrão para o lugar errado: se a lista de vendas falhou, o menu, a busca
 * e o resto continuam funcionando — a pessoa precisa é de um caminho lateral,
 * não de uma tela cheia dizendo que tudo deu errado.
 *
 * Este arquivo vive DENTRO do layout do painel, então a barra lateral e o topo
 * seguem na tela. O que quebra é só o conteúdo, e é só o conteúdo que este
 * cartão substitui.
 */
export default function ErroNoPainel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Erro na tela do painel:', error);
  }, [error]);

  /**
   * Sair pelo menu precisa funcionar — e não funcionava.
   *
   * O limite de erro do Next NÃO se desfaz sozinho ao trocar de rota: ele
   * continua marcado como quebrado, tenta renderizar de novo durante a
   * navegação, estoura outra vez e a falha sobe até o erro global. Na prática:
   * a pessoa via este cartão, clicava em "Produtos" no menu (que este mesmo
   * cartão oferece como saída) e caía numa tela pior, "O sistema não conseguiu
   * abrir", sem sair do /dashboard. Medido — foi assim que este defeito
   * apareceu.
   *
   * `reset()` quando o endereço muda desfaz o limite no momento certo. A
   * comparação com o endereço de origem evita o laço: sem ela, o reset
   * dispararia na própria tela quebrada, que quebraria de novo, sem parar.
   */
  const pathname = usePathname();
  const ondeQuebrou = useRef(pathname);

  useEffect(() => {
    if (pathname !== ondeQuebrou.current) reset();
  }, [pathname, reset]);

  return (
    <div className="card p-8 text-center">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </span>

      <h2 className="text-base font-semibold text-texto">Esta tela não carregou</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-suave">
        Alguma coisa falhou aqui dentro — não foi você. O resto do painel continua funcionando; tentar de novo costuma
        resolver.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button onClick={reset} className="btn-primary">
          Tentar de novo
        </button>
        <Link href="/dashboard" className="btn-secondary">
          Voltar ao início
        </Link>
      </div>

      {error.digest && (
        <p className="mt-6 font-mono text-xs text-tenue">Código para o suporte: {error.digest}</p>
      )}
    </div>
  );
}
