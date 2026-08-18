'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AtalhosGlobais } from '@/components/AtalhosGlobais';
import { ProvedorDeAvisos } from '@/components/Avisos';
import { PaletaDeComandos } from '@/components/PaletaDeComandos';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { pareceLogado } from '@/lib/session';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  // A gaveta do menu só aparece no celular; em telas maiores a sidebar é fixa
  // e este estado fica sem efeito.
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!pareceLogado()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <ProvedorDeAvisos>
      {/* Fora da árvore visual: só aparece com Ctrl+K, e escuta o teclado da
          janela inteira. */}
      <PaletaDeComandos />
      {/* Também fora da árvore visual: escuta o teclado e só desenha algo
          quando alguém pede a ajuda com "?". */}
      <AtalhosGlobais />
      <div className="flex min-h-screen">
        <Sidebar open={menuOpen} onClose={closeMenu} />
        {/* min-w-0: sem isso, um filho largo (tabela, gráfico) impede a coluna
            de encolher e a página inteira passa a rolar de lado no celular. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenMenu={() => setMenuOpen(true)} />
          {/* Teto de largura: numa tela de 27" uma tabela esticada de ponta a
              ponta obriga o olho a atravessar o monitor inteiro para ligar o
              nome do produto ao preço. */}
          {/* A chave na rota faz a entrada animar a cada navegação: sem ela o
              React reaproveita o nó e a tela nova simplesmente troca, sem
              nenhum sinal de que algo mudou. */}
          <main key={pathname} className="mx-auto w-full max-w-[1500px] flex-1 animate-surgir p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </ProvedorDeAvisos>
  );
}
