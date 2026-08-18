import type { Metadata } from 'next';
import { SCRIPT_DE_INICIO } from '@/lib/preferencias';
import './globals.css';

export const metadata: Metadata = {
  title: 'ComerciON',
  description: 'Painel administrativo — ComerciON',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` só nesta tag, e por um motivo específico: o
    // script abaixo escreve `class="dark"` e `data-densidade` no <html> ANTES
    // da hidratação, e o React reclama de todo atributo que ele não esperava
    // ("Extra attributes from the server"). O aviso saía em todas as 22 telas
    // — a suíte que varre o painel inteiro reprovou por causa dele. A diferença
    // é intencional: o servidor não tem como saber a preferência de quem abriu.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Aplica tema e densidade antes da primeira pintura — sem isso a
            página nasce clara e vira escura depois que o React monta. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DE_INICIO }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
