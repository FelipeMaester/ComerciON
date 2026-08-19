'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

export interface AcaoDeLinha {
  rotulo: string;
  /** Ação que navega. Use `href` OU `aoClicar`, não os dois. */
  href?: string;
  aoClicar?: () => void | Promise<void>;
  /** Ação destrutiva (desativar, cancelar): sai em vermelho e no fim da lista. */
  perigo?: boolean;
  /** Some do menu em vez de aparecer desabilitada — menu curto se lê inteiro. */
  oculta?: boolean;
}

/** Largura do menu. Fixa porque a posição é calculada antes de ele existir. */
const LARGURA = 208;

/**
 * As ações de uma linha, atrás de um botão "…".
 *
 * Antes, a única coisa que dava para fazer com uma peça na lista era abrir a
 * ficha dela: qualquer outra coisa — vender no balcão, copiar o SKU para
 * mandar ao fornecedor, desativar a que saiu de linha — exigia abrir, agir e
 * voltar. Numa conferência de estoque isso é ida e volta a cada item.
 *
 * O menu é desenhado num portal, com posição fixa calculada a partir do botão.
 * Não é firula: a tabela vive dentro de um contêiner com `overflow-x: auto`
 * (para rolar de lado no celular), e contêiner que rola CORTA qualquer coisa
 * posicionada dentro dele — o menu apareceria pela metade, ou empurraria a
 * largura da tabela. No portal ele fica fora desse recorte.
 *
 * Fecha ao rolar a página: a posição foi calculada uma vez, e um menu que
 * desliza para longe do próprio botão confunde mais do que ajuda.
 */
export function AcoesDaLinha({ acoes, rotulo = 'Ações' }: { acoes: AcaoDeLinha[]; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const visiveis = acoes.filter((a) => !a.oculta);

  const posicionar = useCallback(() => {
    const alvo = botao.current;
    if (!alvo) return;
    const r = alvo.getBoundingClientRect();
    const altura = visiveis.length * 36 + 8;
    // Abre para cima quando não há espaço embaixo — na última linha de uma
    // lista longa, é sempre esse o caso.
    const cabeEmbaixo = r.bottom + altura + 8 < window.innerHeight;
    setPosicao({
      top: cabeEmbaixo ? r.bottom + 4 : r.top - altura - 4,
      // Alinhado pela direita do botão, sem sair da janela no celular.
      left: Math.max(8, Math.min(r.right - LARGURA, window.innerWidth - LARGURA - 8)),
    });
  }, [visiveis.length]);

  useLayoutEffect(() => {
    if (aberto) posicionar();
  }, [aberto, posicionar]);

  useEffect(() => {
    if (!aberto) return;

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setAberto(false);
        botao.current?.focus();
      }
    }
    function aoClicarFora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (menu.current?.contains(alvo) || botao.current?.contains(alvo)) return;
      setAberto(false);
    }
    /**
     * Rolou? Reposiciona; só fecha se o botão saiu da tela.
     *
     * A primeira versão fechava a qualquer rolagem, e isso quebrava o menu por
     * um motivo invisível: rolagem não vem só de quem rola. Um aviso que
     * aparece, o sino que carrega e muda a altura do topo, o próprio navegador
     * trazendo um elemento à vista — tudo dispara `scroll`, e o menu sumia no
     * instante seguinte ao clique. Media-se como "o item foi removido da tela
     * antes de eu conseguir clicar"; na suíte inteira, quatro testes caíram
     * assim.
     */
    function aoRolar() {
      const r = botao.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight) {
        setAberto(false);
        return;
      }
      posicionar();
    }

    window.addEventListener('keydown', aoTeclar);
    document.addEventListener('mousedown', aoClicarFora);
    // `capture` para pegar a rolagem de qualquer contêiner, não só a da janela.
    window.addEventListener('scroll', aoRolar, true);
    window.addEventListener('resize', aoRolar);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('mousedown', aoClicarFora);
      window.removeEventListener('scroll', aoRolar, true);
      window.removeEventListener('resize', aoRolar);
    };
  }, [aberto, posicionar]);

  if (visiveis.length === 0) return null;

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={rotulo}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-tenue transition-colors hover:bg-realce hover:text-texto ${
          aberto ? 'bg-realce text-texto' : ''
        }`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>

      {aberto &&
        posicao &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            style={{ position: 'fixed', top: posicao.top, left: posicao.left, width: LARGURA }}
            className="z-[45] overflow-hidden rounded-xl border border-linha bg-superficie py-1 shadow-flutuante"
          >
            {visiveis.map((acao) => {
              const classe = `flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${
                acao.perigo
                  ? 'text-red-600 hover:bg-red-500/10 dark:text-red-400'
                  : 'text-texto hover:bg-realce'
              }`;

              if (acao.href) {
                return (
                  <Link key={acao.rotulo} href={acao.href} role="menuitem" className={classe} onClick={() => setAberto(false)}>
                    {acao.rotulo}
                  </Link>
                );
              }
              return (
                <button
                  key={acao.rotulo}
                  type="button"
                  role="menuitem"
                  className={classe}
                  onClick={async () => {
                    setAberto(false);
                    await acao.aoClicar?.();
                  }}
                >
                  {acao.rotulo}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
