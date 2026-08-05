import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

const DEFAULT_TITLE = 'Distribuidora Demo — Loja Virtual';
const DEFAULT_DESCRIPTION = 'Peças automotivas com entrega rápida';

// Server-side (não pode usar o lib/api-client 'use client'): busca a marca do
// tenant para o título da aba refletir o nome configurado em /settings. Se a
// API estiver fora do ar, cai para o título padrão em vez de quebrar a página.
export async function generateMetadata(): Promise<Metadata> {
  const apiUrl = process.env.NEXT_PUBLIC_STOREFRONT_API_URL ?? 'http://localhost:3001';
  const tenantSlug = process.env.NEXT_PUBLIC_TENANT_SLUG ?? 'demo';
  try {
    const res = await fetch(`${apiUrl}/api/storefront/branding`, {
      headers: { 'x-tenant-slug': tenantSlug },
      cache: 'no-store',
    });
    if (res.ok) {
      const branding = await res.json();
      return {
        title: branding.name ? `${branding.name} — Loja Virtual` : DEFAULT_TITLE,
        description: branding.tagline || DEFAULT_DESCRIPTION,
      };
    }
  } catch {
    // Fallback abaixo.
  }
  return { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION };
}

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
