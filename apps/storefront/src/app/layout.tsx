import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Distribuidora Demo — Loja Virtual',
  description: 'Peças automotivas com entrega rápida',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Aplica o tema salvo antes da primeira pintura — sem isso a página pisca no tema errado ao carregar. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
