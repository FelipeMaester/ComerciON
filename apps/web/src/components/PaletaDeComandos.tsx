'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { formatarMoeda } from '@/lib/format';
import { carregarModulos } from '@/lib/loja';
import { getCurrentUserRole } from '@/lib/session';
import type { Customer, ModuleKey, Paginated, Product } from '@/lib/types';
import { DASHBOARD, GROUPS, type NavItem } from './Sidebar';
import { Giro } from './Botao';
import { Icone, type NomeDoIcone } from './Icone';

interface Destino extends NavItem {
  grupo?: string;
  /** Linha secundária: SKU da peça, telefone do cliente. */
  detalhe?: string;
}

/** Espera antes de consultar a API, para não disparar uma busca por tecla. */
const ESPERA_DA_BUSCA = 250;
const MINIMO_PARA_BUSCAR = 2;
const RESULTADOS_POR_TIPO = 5;

/**
 * Achar qualquer coisa digitando: telas, peças e clientes.
 *
 * Num sistema de vinte e duas telas, o caminho "abrir o grupo certo do menu,
 * achar o item, clicar" custa três decisões para quem já sabe aonde vai.
 * Ctrl+K, três letras e Enter custa uma.
 *
 * A busca não para nas telas, e é isso que a torna útil no balcão: quem ouve
 * "tem radiador do Gol?" digita "radiador" e vê a peça, o preço e o estoque
 * sem sair de onde está. É o padrão que os sistemas de gestão brasileiros
 * (Bling, Omie, Conta Azul) já assumem como básico.
 *
 * A lista de telas sai do MESMO mapa que desenha o menu lateral, filtrada
 * pelos mesmos módulos do plano e papéis — e a busca de dados respeita o
 * mesmo gate: sem o módulo de estoque, não adianta oferecer peças que a API
 * vai recusar com 403.
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

  const telasEncontradas = useMemo(() => {
    const termo = normalizar(busca);
    if (!termo) return destinos;
    return destinos.filter(
      (d) => normalizar(d.label).includes(termo) || normalizar(d.grupo ?? '').includes(termo),
    );
  }, [busca, destinos]);

  const [dados, setDados] = useState<Destino[]>([]);
  const [buscandoDados, setBuscandoDados] = useState(false);

  /**
   * Consulta a API enquanto se digita.
   *
   * O contador de requisições resolve a corrida: digitando rápido, a resposta
   * de "rad" pode chegar depois da de "radiador" e sobrescrever a lista com
   * resultados de um termo que já não está mais no campo.
   */
  const sequencia = useRef(0);
  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < MINIMO_PARA_BUSCAR) {
      setDados([]);
      setBuscandoDados(false);
      return;
    }

    const minha = ++sequencia.current;
    setBuscandoDados(true);
    const relogio = setTimeout(async () => {
      const podeVer = (m: ModuleKey) => !modulos || modulos.includes(m);
      const consulta = encodeURIComponent(termo);

      const [pecas, clientes] = await Promise.all([
        podeVer('INVENTORY')
          ? api
              .get<Paginated<Product>>(`/products?search=${consulta}&pageSize=${RESULTADOS_POR_TIPO}`)
              .then((r) => r.items)
              .catch(() => [])
          : Promise.resolve([]),
        podeVer('CRM')
          ? api
              .get<Paginated<Customer>>(`/customers?search=${consulta}&pageSize=${RESULTADOS_POR_TIPO}`)
              .then((r) => r.items)
              .catch(() => [])
          : Promise.resolve([]),
      ]);

      // Chegou tarde? A resposta é de um termo antigo — descarta.
      if (minha !== sequencia.current) return;

      setDados([
        ...pecas.slice(0, RESULTADOS_POR_TIPO).map((p) => ({
          href: `/products/${p.id}`,
          label: p.name,
          icone: 'produto' as NomeDoIcone,
          grupo: 'Peça',
          detalhe: `${p.sku} · ${formatarMoeda(Number(p.price))}`,
        })),
        ...clientes.slice(0, RESULTADOS_POR_TIPO).map((c) => ({
          href: `/customers/${c.id}`,
          label: c.name,
          icone: 'cliente' as NomeDoIcone,
          grupo: 'Cliente',
          detalhe: c.phone ?? undefined,
        })),
      ]);
      setBuscandoDados(false);
    }, ESPERA_DA_BUSCA);

    return () => clearTimeout(relogio);
  }, [busca, modulos]);

  // Telas primeiro: quem digita "produtos" quer a tela, não uma peça chamada
  // "produtos". Os dados vêm logo abaixo, no mesmo percurso das setas.
  const resultados = useMemo(() => [...telasEncontradas, ...dados], [telasEncontradas, dados]);

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
            placeholder="Buscar tela, peça ou cliente…"
            aria-label="Buscar tela"
            className="w-full bg-transparent py-3.5 text-sm text-texto outline-none placeholder:text-tenue"
          />
          {buscandoDados && <Giro className="h-3.5 w-3.5 shrink-0 text-tenue" />}
          <kbd className="hidden shrink-0 rounded border border-linha px-1.5 py-0.5 text-[10px] text-tenue sm:block">
            Esc
          </kbd>
        </div>

        {resultados.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-tenue">
            {buscandoDados ? 'Procurando…' : 'Nada encontrado com esse nome.'}
          </p>
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
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{destino.label}</span>
                    {destino.detalhe && (
                      <span className="block truncate text-xs text-tenue">{destino.detalhe}</span>
                    )}
                  </span>
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
