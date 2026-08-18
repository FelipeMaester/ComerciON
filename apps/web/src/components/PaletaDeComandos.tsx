'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { carregarModulos } from '@/lib/loja';
import { getCurrentUserRole } from '@/lib/session';
import type { ModuleKey } from '@/lib/types';
import { DASHBOARD, GROUPS, type NavItem } from './Sidebar';
import { Icone } from './Icone';

interface Destino extends NavItem {
  grupo?: string;
}

/**
 * Ir direto para qualquer tela digitando o nome dela.
 *
 * Num sistema de vinte e duas telas, o caminho "abrir o grupo certo do menu,
 * achar o item, clicar" custa três decisões para quem já sabe aonde vai.
 * Ctrl+K, três letras e Enter custa uma.
 *
 * A lista sai do MESMO mapa que desenha o menu lateral, filtrada pelos mesmos
 * módulos do plano e papéis. Se fosse uma lista à parte, um dia ela ofereceria
 * uma tela que o plano não libera e a pessoa levaria um 403 depois de digitar
 * o nome certo.
 */
export function PaletaDeComandos() {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState('');
  const [indice, setIndice] = useState(0);
  const [modulos, setModulos] = useState<ModuleKey[] | null>(null);
  const [papel, setPapel] = useState<string | null>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setPapel(getCurrentUserRole());
    carregarModulos()
      .then(setModulos)
      .catch(() => setModulos(null));
  }, []);

  const fechar = useCallback(() => {
    setAberta(false);
    setBusca('');
    setIndice(0);
  }, []);

  // Ctrl+K no Windows/Linux, Cmd+K no Mac.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAberta((a) => !a);
        return;
      }
      if (e.key === 'Escape') fechar();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [fechar]);

  useEffect(() => {
    if (aberta) campoRef.current?.focus();
  }, [aberta]);

  const destinos: Destino[] = useMemo(() => {
    const visivel = (item: NavItem) => {
      if (item.roles && !item.roles.includes(papel ?? '')) return false;
      if (item.module && modulos && !modulos.includes(item.module)) return false;
      return true;
    };

    return [
      { ...DASHBOARD, grupo: 'Visão geral' },
      ...GROUPS.flatMap((g) => g.items.filter(visivel).map((item) => ({ ...item, grupo: g.title }))),
      // Telas fora do menu, que existem e ninguém acha: a engrenagem do topo e
      // o rodapé do menu são os únicos caminhos até elas hoje.
      { href: '/settings', label: 'Configurações da loja', icone: 'administracao', grupo: 'Configuração' },
      { href: '/account', label: 'Minha conta e aparência', icone: 'usuario', grupo: 'Configuração' },
    ];
  }, [modulos, papel]);

  const resultados = useMemo(() => {
    const termo = normalizar(busca);
    if (!termo) return destinos;
    return destinos.filter(
      (d) => normalizar(d.label).includes(termo) || normalizar(d.grupo ?? '').includes(termo),
    );
  }, [busca, destinos]);

  function irPara(destino: Destino) {
    fechar();
    router.push(destino.href);
  }

  function aoTeclarNoCampo(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndice((i) => Math.min(resultados.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndice((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && resultados[indice]) {
      e.preventDefault();
      irPara(resultados[indice]);
    }
  }

  // Mantém o item selecionado dentro da área visível ao navegar pelo teclado.
  useEffect(() => {
    listaRef.current?.children[indice]?.scrollIntoView({ block: 'nearest' });
  }, [indice]);

  if (!aberta) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={fechar}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Ir para uma tela"
        className="w-full max-w-lg animate-surgir overflow-hidden rounded-xl border border-linha bg-superficie shadow-flutuante"
      >
        <div className="flex items-center gap-2.5 border-b border-linha px-3.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-tenue">
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={campoRef}
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setIndice(0);
            }}
            onKeyDown={aoTeclarNoCampo}
            placeholder="Ir para… (PDV, clientes, caixa)"
            aria-label="Buscar tela"
            className="w-full bg-transparent py-3.5 text-sm text-texto outline-none placeholder:text-tenue"
          />
          <kbd className="hidden shrink-0 rounded border border-linha px-1.5 py-0.5 text-[10px] text-tenue sm:block">
            Esc
          </kbd>
        </div>

        {resultados.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-tenue">Nenhuma tela com esse nome.</p>
        ) : (
          <ul ref={listaRef} className="max-h-[52vh] overflow-y-auto p-1.5">
            {resultados.map((destino, i) => (
              <li key={destino.href}>
                <button
                  onClick={() => irPara(destino)}
                  onPointerMove={() => setIndice(i)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    i === indice ? 'bg-marca/10 text-marca-legivel' : 'text-texto hover:bg-realce'
                  }`}
                >
                  <Icone nome={destino.icone} className="h-[18px] w-[18px] shrink-0 opacity-70" />
                  <span className="flex-1 truncate">{destino.label}</span>
                  {destino.grupo && <span className="shrink-0 text-xs text-tenue">{destino.grupo}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Tira acento para a busca casar do jeito que se digita com pressa.
 *
 * Quem procura "orcamento" sem cedilha, ou "relatorio" sem acento, é a regra e
 * não a exceção — principalmente no balcão, com uma mão no teclado.
 */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
