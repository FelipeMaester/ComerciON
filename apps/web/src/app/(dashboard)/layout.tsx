'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { pareceLogado } from '@/lib/session';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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
    <div className="flex min-h-screen">
      <Sidebar open={menuOpen} onClose={closeMenu} />
      {/* min-w-0: sem isso, um filho largo (tabela, gráfico) impede a coluna
          de encolher e a página inteira passa a rolar de lado no celular. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />
        {/* Teto de largura: numa tela de 27" uma tabela esticada de ponta a
            ponta obriga o olho a atravessar o monitor inteiro para ligar o
            nome do produto ao preço. */}
        <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
