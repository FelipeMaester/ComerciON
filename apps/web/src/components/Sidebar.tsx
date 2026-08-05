'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getCurrentUserRole } from '@/lib/session';

const AVAILABLE = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/pos', label: 'PDV (venda rápida)' },
  { href: '/sales', label: 'Vendas' },
  { href: '/logistics', label: 'Expedição (romaneio)' },
  { href: '/whatsapp', label: 'WhatsApp' },
  { href: '/reports', label: 'Relatórios' },
  { href: '/finance', label: 'Financeiro' },
  { href: '/customers', label: 'Clientes' },
  { href: '/products', label: 'Produtos e estoque' },
  { href: '/suppliers', label: 'Fornecedores' },
  { href: '/users', label: 'Usuários' },
];

// Assinatura é sensível (troca de plano, cobrança) — só quem administra a
// empresa deveria nem ver o link; o backend já restringe (@Roles(ADMIN)),
// isso aqui só evita levar o resto do time a uma tela que vai dar 403.
const BILLING_ITEM = { href: '/billing', label: 'Assinatura' };

// Painel de plataforma — só existe para quem tem o papel SUPER_ADMIN,
// que enxerga todos os tenants, não só o próprio.
const ADMIN_ITEM = { href: '/admin/tenants', label: 'Administração' };

export function Sidebar() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setRole(getCurrentUserRole());
  }, []);

  const items = [
    ...AVAILABLE,
    ...(role === 'ADMIN' || role === 'SUPER_ADMIN' ? [BILLING_ITEM] : []),
    ...(role === 'SUPER_ADMIN' ? [ADMIN_ITEM] : []),
  ];

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4">
      <div className="mb-6 px-2 text-lg font-semibold">Comércio ERP</div>

      <nav className="space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-lg px-3 py-2 text-sm ${
              pathname === item.href ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
