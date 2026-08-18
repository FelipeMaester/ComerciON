'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { carregarModulos, carregarPerfil } from '@/lib/loja';
import { aplicarCorDaMarca, iniciaisDaLoja } from '@/lib/marca';
import { getCurrentUserRole } from '@/lib/session';
import type { ModuleKey, UserProfile } from '@/lib/types';
import { Icone, type NomeDoIcone } from './Icone';

export interface NavItem {
  href: string;
  label: string;
  icone: NomeDoIcone;
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
 *
 * O ícone existe porque a lista é longa: quem já sabe onde fica o PDV acha o
 * item pela forma, sem reler cinco rótulos.
 */
export const GROUPS: NavGroup[] = [
  {
    title: 'Vender',
    items: [
      { href: '/pos', label: 'PDV (venda rápida)', icone: 'pdv', module: 'SALES' },
      { href: '/cash', label: 'Caixa', icone: 'caixa', module: 'SALES' },
      { href: '/sales', label: 'Vendas', icone: 'vendas', module: 'SALES' },
      { href: '/quotes', label: 'Orçamentos', icone: 'orcamento', module: 'SALES' },
      { href: '/service-orders', label: 'Ordens de serviço', icone: 'ordem', module: 'SALES' },
    ],
  },
  {
    title: 'Estoque',
    items: [
      { href: '/products', label: 'Produtos e estoque', icone: 'produto', module: 'INVENTORY' },
      { href: '/stock-counts', label: 'Contagem de estoque', icone: 'contagem', module: 'INVENTORY' },
      { href: '/suppliers', label: 'Fornecedores', icone: 'fornecedor', module: 'SUPPLIERS' },
    ],
  },
  {
    title: 'Clientes',
    items: [
      { href: '/customers', label: 'Clientes', icone: 'cliente', module: 'CRM' },
      { href: '/whatsapp', label: 'WhatsApp', icone: 'whatsapp', module: 'WHATSAPP' },
      { href: '/pipeline', label: 'Pipeline', icone: 'pipeline', module: 'CRM' },
      { href: '/tasks', label: 'Tarefas', icone: 'tarefa', module: 'CRM' },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { href: '/finance', label: 'Financeiro', icone: 'financeiro', module: 'FINANCE' },
      { href: '/reports', label: 'Relatórios', icone: 'relatorio', module: 'BI' },
      { href: '/automations', label: 'Automações', icone: 'automacao', module: 'AUTOMATIONS' },
      { href: '/coupons', label: 'Cupons', icone: 'cupom', module: 'SALES' },
    ],
  },
  {
    title: 'Configuração',
    items: [
      { href: '/users', label: 'Usuários', icone: 'usuario' },
      // Assinatura é sensível (troca de plano, cobrança) — o backend já
      // restringe com @Roles(ADMIN); isto só evita levar o resto do time a
      // uma tela que vai dar 403.
      { href: '/billing', label: 'Assinatura', icone: 'assinatura', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/admin/tenants', label: 'Administração', icone: 'administracao', roles: ['SUPER_ADMIN'] },
    ],
  },
];

/** Fica fora dos grupos: é a primeira tela e não pertence a nenhuma tarefa. */
export const DASHBOARD: NavItem = { href: '/dashboard', label: 'Dashboard', icone: 'painel' };

/**
 * Onde o usuário está, para a barra do topo — mesmo mapa do menu, para os dois
 * nunca discordarem.
 *
 * Casa pelo prefixo mais longo: `/products/abc-123` é a tela de Produtos, e
 * quem abriu o detalhe de uma peça continua sabendo de onde veio.
 */
export function trilhaDaRota(pathname: string): { secao?: string; pagina: string } | null {
  if (pathname === DASHBOARD.href) return { pagina: DASHBOARD.label };

  let melhor: { secao?: string; pagina: string; tamanho: number } | null = null;
  for (const grupo of GROUPS) {
    for (const item of grupo.items) {
      if (pathname !== item.href && !pathname.startsWith(`${item.href}/`)) continue;
      if (melhor && item.href.length <= melhor.tamanho) continue;
      melhor = { secao: grupo.title, pagina: item.label, tamanho: item.href.length };
    }
  }
  if (melhor) return { secao: melhor.secao, pagina: melhor.pagina };

  // Telas fora do menu (conta, configurações) ainda merecem um rótulo.
  if (pathname.startsWith('/account')) return { pagina: 'Minha conta' };
  if (pathname.startsWith('/settings')) return { pagina: 'Configurações da loja' };
  return null;
}

/** Rótulo legível de cada papel, para o rodapé do menu. */
const PAPEL: Record<string, string> = {
  ADMIN: 'Administrador',
  SALES: 'Vendas',
  STOCK: 'Estoque',
  FINANCE: 'Financeiro',
  SUPER_ADMIN: 'Super admin',
};

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
  const [perfil, setPerfil] = useState<UserProfile | null>(null);

  useEffect(() => {
    setCollapsed(loadCollapsed());
    setRole(getCurrentUserRole());
    carregarModulos()
      .then(setEnabled)
      .catch(() => setEnabled(null));
    carregarPerfil()
      .then((dados) => {
        setPerfil(dados);
        aplicarCorDaMarca(dados.tenantPrimaryColor);
      })
      .catch(() => setPerfil(null));
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
      {open && <div onClick={onClose} aria-hidden className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-sm md:hidden" />}

      <aside
        className={`
          flex w-64 shrink-0 flex-col border-r border-linha bg-superficie
          fixed inset-y-0 left-0 z-40 transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:static md:z-auto md:translate-x-0
        `}
      >
        {/* Identidade da loja. Quem trabalha aqui vê a própria marca, não a de
            quem vendeu o sistema — o "ComerciON" fica como legenda. */}
        <div className="relative flex h-16 shrink-0 items-center gap-3 border-b border-linha bg-gradient-to-b from-marca/[0.06] to-transparent px-4">
          {perfil?.tenantLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={perfil.tenantLogoUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-lg border border-linha object-cover"
            />
          ) : (
            // Mesmo motivo do `.btn-primary`: as iniciais são texto branco em
            // cima da cor da loja, então o gradiente parte da versão já
            // ajustada para contraste, não da cor crua.
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-marca-solida to-marca-forte text-sm font-semibold text-marca-texto shadow-marca">
              {iniciaisDaLoja(perfil?.tenantName)}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight text-texto">
              {perfil?.tenantName ?? 'ComerciON'}
            </span>
            <span className="block text-[11px] leading-tight text-tenue">ComerciON</span>
          </span>
          <button
            onClick={onClose}
            aria-label="Fechar menu"
            className="-mr-1 rounded-lg p-1 text-suave hover:bg-realce hover:text-texto md:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
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
                  className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition hover:bg-realce ${
                    isCollapsed && hasActive ? 'text-texto' : 'text-tenue'
                  }`}
                >
                  <span>{group.title}</span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    className={`h-3 w-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink key={item.href} item={item} active={pathname === item.href} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Quem está logado, no rodapé: é a informação que some primeiro num
            sistema com vários usuários no mesmo balcão. */}
        <Link
          href="/account"
          className="flex shrink-0 items-center gap-3 border-t border-linha px-4 py-3 transition hover:bg-realce"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-marca/10 text-[11px] font-semibold text-marca-legivel">
            {iniciaisDaLoja(perfil?.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium leading-tight text-texto">
              {perfil?.name ?? 'Minha conta'}
            </span>
            <span className="block truncate text-[11px] leading-tight text-tenue">
              {PAPEL[perfil?.role ?? role ?? ''] ?? 'Minha conta'}
            </span>
          </span>
        </Link>
      </aside>
    </>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150 ease-saida ${
        active
          ? 'bg-marca/10 font-medium text-marca-legivel'
          : 'text-suave hover:translate-x-0.5 hover:bg-realce hover:text-texto'
      }`}
    >
      {/* Barrinha na borda esquerda do item atual. O fundo tingido sozinho é
          fraco demais quando a cor da loja é clara — a barra sólida marca a
          posição em qualquer cor. */}
      {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-marca" />}
      <Icone
        nome={item.icone}
        className={`h-[18px] w-[18px] shrink-0 transition-transform duration-150 ${
          active ? '' : 'text-tenue group-hover:scale-110 group-hover:text-suave'
        }`}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
