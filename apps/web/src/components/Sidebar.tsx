'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api-client';
import { getCurrentUserRole } from '@/lib/session';
import type { ModuleKey, TenantModules } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  /** Módulo do plano que libera este item. Ausente = sempre disponível. */
  module?: ModuleKey;
  /** Papéis que enxergam o item. Ausente = todos. */
  roles?: string[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * Menu agrupado por tarefa, não por módulo técnico.
 *
 * Eram 16 itens numa lista corrida: quem abre o sistema para vender via
 * "Automações" e "Fornecedores" com o mesmo peso do PDV. Agrupar por aquilo
 * que a pessoa veio fazer ("Vender", "Estoque") torna a lista escaneável sem
 * esconder nada.
 *
 * O campo `module` é o que faz o menu respeitar o plano: cada item declara o
 * módulo que o libera, e a lista real vem de GET /billing/my-modules — a MESMA
 * fonte que o gate da API usa para devolver 403. Antes, um tenant no Trial via
 * "Automações" no menu e tomava 403 ao clicar.
 */
const GROUPS: NavGroup[] = [
  {
    title: 'Vender',
    items: [
      { href: '/pos', label: 'PDV (venda rápida)', module: 'SALES' },
      { href: '/cash', label: 'Caixa', module: 'SALES' },
      { href: '/sales', label: 'Vendas', module: 'SALES' },
      { href: '/quotes', label: 'Orçamentos', module: 'SALES' },
      { href: '/service-orders', label: 'Ordens de serviço', module: 'SALES' },
    ],
  },
  {
    title: 'Estoque',
    items: [
      { href: '/products', label: 'Produtos e estoque', module: 'INVENTORY' },
      { href: '/stock-counts', label: 'Contagem de estoque', module: 'INVENTORY' },
      { href: '/suppliers', label: 'Fornecedores', module: 'SUPPLIERS' },
      { href: '/shipments', label: 'Expedição', module: 'LOGISTICS' },
    ],
  },
  {
    title: 'Clientes',
    items: [
      { href: '/customers', label: 'Clientes', module: 'CRM' },
      { href: '/whatsapp', label: 'WhatsApp', module: 'WHATSAPP' },
      { href: '/pipeline', label: 'Pipeline', module: 'CRM' },
      { href: '/tasks', label: 'Tarefas', module: 'CRM' },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { href: '/finance', label: 'Financeiro', module: 'FINANCE' },
      { href: '/reports', label: 'Relatórios', module: 'BI' },
      { href: '/automations', label: 'Automações', module: 'AUTOMATIONS' },
      { href: '/coupons', label: 'Cupons', module: 'ECOMMERCE' },
    ],
  },
  {
    title: 'Configuração',
    items: [
      { href: '/users', label: 'Usuários' },
      // Assinatura é sensível (troca de plano, cobrança) — o backend já
      // restringe com @Roles(ADMIN); isto só evita levar o resto do time a
      // uma tela que vai dar 403.
      { href: '/billing', label: 'Assinatura', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/tenants', label: 'Administração', roles: ['SUPER_ADMIN'] },
    ],
  },
];

/** Fica fora dos grupos: é a primeira tela e não pertence a nenhuma tarefa. */
const DASHBOARD: NavItem = { href: '/dashboard', label: 'Dashboard' };

/**
 * Onde ficam os grupos recolhidos. Persistir importa: se resetasse a cada
 * navegação, recolher um grupo não serviria pra nada — a pessoa recolhe
 * "Configuração" justamente para não vê-lo o dia inteiro.
 */
const COLLAPSED_KEY = 'comercion.menu.collapsed';

function loadCollapsed(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    // localStorage indisponível (modo privado, storage cheio) ou JSON corrompido
    // por uma versão anterior: menu todo aberto é um padrão seguro.
    return [];
  }
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  // `null` enquanto carrega: melhor mostrar o menu completo por um instante do
  // que piscar itens aparecendo, e o backend bloqueia de qualquer forma.
  const [enabled, setEnabled] = useState<ModuleKey[] | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);

  useEffect(() => {
    setCollapsed(loadCollapsed());
    setRole(getCurrentUserRole());
    api
      .get<TenantModules>('/billing/my-modules')
      .then((data) => setEnabled(data.modules))
      .catch(() => setEnabled(null));
  }, []);

  // Navegou? Fecha. Sem isso, no celular a gaveta ficaria por cima da página
  // que o usuário acabou de abrir.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function toggleGroup(title: string) {
    setCollapsed((prev) => {
      const next = prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title];
      try {
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        // Sem localStorage o menu ainda funciona, só não lembra na próxima visita.
      }
      return next;
    });
  }

  function isVisible(item: NavItem): boolean {
    if (item.roles && !item.roles.includes(role ?? '')) return false;
    if (item.module && enabled && !enabled.includes(item.module)) return false;
    return true;
  }

  // Grupo que ficou sem nenhum item visível não deve deixar um título órfão.
  const visibleGroups = GROUPS.map((g) => ({ ...g, items: g.items.filter(isVisible) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <>
      {/* Fundo escurecido: fecha ao tocar fora, que é o gesto que todo mundo
          tenta primeiro. Só existe no celular, com a gaveta aberta. */}
      {open && <div onClick={onClose} aria-hidden className="fixed inset-0 z-30 bg-slate-900/50 md:hidden" />}

      <aside
        className={`
          flex w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white p-4
          dark:border-slate-700 dark:bg-slate-900
          fixed inset-y-0 left-0 z-40 transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:static md:z-auto md:translate-x-0
        `}
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <span className="text-lg font-semibold">ComerciON</span>
          <button
            onClick={onClose}
            aria-label="Fechar menu"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 md:hidden"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="space-y-5">
          <NavLink item={DASHBOARD} active={pathname === DASHBOARD.href} />

          {visibleGroups.map((group) => {
            const isCollapsed = collapsed.includes(group.title);
            // Recolher é escolha do usuário e ela é respeitada — inclusive no
            // grupo da página atual. Para ele não ficar sem referência, o
            // título fica destacado quando esconde a tela em que ele está.
            const hasActive = group.items.some((i) => i.href === pathname);

            return (
              <div key={group.title}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  aria-expanded={!isCollapsed}
                  className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1 text-xs font-medium uppercase tracking-wide hover:bg-slate-100 dark:hover:bg-slate-800 ${
                    isCollapsed && hasActive
                      ? 'text-slate-700 dark:text-slate-200'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <span>{group.title}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {!isCollapsed && (
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <NavLink key={item.href} item={item} active={pathname === item.href} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`block rounded-lg px-3 py-2 text-sm ${
        active
          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {item.label}
    </Link>
  );
}
