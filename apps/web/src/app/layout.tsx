import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Comércio ERP',
  description: 'Painel administrativo — Comércio ERP',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
