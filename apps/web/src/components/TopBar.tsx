'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { esquecerPerfil } from '@/lib/loja';
import { clearSession } from '@/lib/session';
import { trilhaDaRota } from './Sidebar';
import { ajudaDaRota } from '@/lib/ajuda';
import { SinoDeAvisos } from './SinoDeAvisos';
import { ThemeToggle } from './ThemeToggle';

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const trilha = trilhaDaRota(pathname ?? '');

  async function handleLogout() {
    try {
      // Sem corpo: o refresh token vai no cookie httpOnly, e é a API que o
      // revoga e apaga os dois cookies.
      await api.post('/auth/logout', {});
    } finally {
      clearSession();
      esquecerPerfil();
      router.push('/login');
    }
  }

  return (
    // `supports-[backdrop-filter]`: sem suporte a desfoque, o fundo vira
    // opaco. Com 85% de opacidade e sem desfoque, o conteúdo que passa por
    // baixo ao rolar fica legível através da barra.
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-linha bg-fundo/90 px-4 backdrop-blur-md md:px-6">
      {/* Abre a gaveta do menu — só existe no celular, onde a sidebar fixa
          não cabe. */}
      <button onClick={onOpenMenu} aria-label="Abrir menu" className="btn-icone -ml-1 md:hidden">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Onde estou. A barra vivia vazia; num sistema de vinte telas, saber a
          seção atual é o que evita o "cliquei errado e não percebi". O título
          da própria tela continua dentro do conteúdo — aqui é a trilha. */}
      <nav aria-label="Trilha de navegação" className="mr-auto min-w-0 truncate text-sm">
        {trilha?.secao && (
          <>
            <span className="text-tenue">{trilha.secao}</span>
            <span className="mx-1.5 text-tenue">/</span>
          </>
        )}
        <span className="font-medium text-texto">{trilha?.pagina ?? ''}</span>
      </nav>

      {/* Atalho que ninguém descobre não existe. Este botão faz a mesma coisa
          que o Ctrl+K e, ao mostrar a tecla, ensina o atalho para quem clicar
          nele duas ou três vezes. Some no celular, onde não há teclado. */}
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
        // `text-suave`, não `text-tenue`: o tom mais tênue foi calibrado contra
        // o fundo da página, e aqui o botão tem fundo próprio, mais claro. Sobre
        // ele o texto caía para 4,27:1 no tema escuro — abaixo do mínimo.
        className="hidden items-center gap-2 rounded-lg border border-linha bg-realce/60 px-2.5 py-1.5 text-xs text-suave transition-colors hover:border-marca/40 hover:text-texto sm:flex"
        title="Ir para uma tela"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
        </svg>
        Ir para…
        <kbd className="rounded border border-linha bg-superficie px-1 py-px text-[10px] font-sans">Ctrl K</kbd>
      </button>

      <SinoDeAvisos />

      {/* Leva ao verbete da tela em que a pessoa está, não ao índice. A dúvida
          nasce aqui; obrigar quem travou no PDV a procurar "PDV" numa lista de
          vinte e duas telas é fazer a ajuda começar cobrando trabalho. */}
      <Link
        href={ajudaDaRota(pathname ?? '')}
        title="Ajuda desta tela"
        aria-label="Ajuda desta tela"
        className="btn-icone"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
          <circle cx="12" cy="12" r="9.2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.4 9.2a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.3-2.6 4" />
          <path strokeLinecap="round" d="M12 17.4h.01" />
        </svg>
      </Link>

      <Link href="/settings" title="Configurações da loja" aria-label="Configurações da loja" className="btn-icone group">
        {/* A engrenagem gira devagar no hover: é o tipo de detalhe que faz o
            ícone parecer um botão de verdade, e não um adesivo. */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          className="h-5 w-5 transition-transform duration-500 group-hover:rotate-90"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </Link>
      <ThemeToggle />
      <button onClick={handleLogout} title="Sair do sistema" className="btn-ghost">
        Sair
      </button>
    </header>
  );
}
