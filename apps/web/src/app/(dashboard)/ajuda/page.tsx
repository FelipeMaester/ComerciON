'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icone } from '@/components/Icone';
import { AJUDA, DASHBOARD, GROUPS, type NavItem } from '@/components/Sidebar';
import { TOPICO_POR_HREF, combina, type Topico } from '@/lib/ajuda';
import { carregarModulos } from '@/lib/loja';
import { getCurrentUserRole } from '@/lib/session';
import type { ModuleKey } from '@/lib/types';

/** Uma tela do menu junto do texto que a explica. */
interface Verbete {
  item: NavItem;
  topico: Topico;
}

/** `/whatsapp/conexao` vira `ajuda-whatsapp-conexao`, para dar link direto. */
function ancora(href: string): string {
  return `ajuda-${href.replace(/^\//, '').replace(/\//g, '-')}`;
}

export default function AjudaPage() {
  const [busca, setBusca] = useState('');
  const [papel, setPapel] = useState<string | null>(null);
  // `null` enquanto carrega — mesma escolha do menu: mostrar tudo por um
  // instante é melhor que piscar itens aparecendo.
  const [modulos, setModulos] = useState<ModuleKey[] | null>(null);

  useEffect(() => {
    setPapel(getCurrentUserRole());
    carregarModulos()
      .then(setModulos)
      .catch(() => setModulos(null));
  }, []);

  /**
   * A ajuda mostra o que a pessoa tem, e só.
   *
   * O filtro é o mesmo do menu, de propósito: ensinar uma função que o plano
   * não libera é vender pelo lugar errado, e deixa quem lê procurando no menu
   * uma tela que não existe para ele.
   */
  const secoes = useMemo(() => {
    const visivel = (item: NavItem) => {
      if (item.roles && !item.roles.includes(papel ?? '')) return false;
      if (item.module && modulos && !modulos.includes(item.module)) return false;
      return true;
    };

    const comTexto = (item: NavItem): Verbete | null => {
      const topico = TOPICO_POR_HREF.get(item.href);
      return topico ? { item, topico } : null;
    };

    const grupos = [
      { titulo: 'Visão geral', verbetes: [comTexto(DASHBOARD)] },
      ...GROUPS.map((g) => ({ titulo: g.title, verbetes: g.items.filter(visivel).map(comTexto) })),
    ];

    return grupos
      .map((g) => ({
        titulo: g.titulo,
        verbetes: g.verbetes.filter((v): v is Verbete => v !== null).filter((v) => combina(v.topico, busca)),
      }))
      .filter((g) => g.verbetes.length > 0);
  }, [busca, modulos, papel]);

  const achou = secoes.reduce((total, s) => total + s.verbetes.length, 0);
  const procurando = busca.trim().length > 0;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="titulo-pagina">Ajuda</h1>
      <p className="subtitulo mt-1">
        O que cada tela faz e as dúvidas que ela costuma provocar. Se a sua não estiver aqui, é falha nossa — vale
        avisar.
      </p>

      <div className="mt-5">
        <label htmlFor="busca-ajuda" className="sr-only">
          Buscar na ajuda
        </label>
        <input
          id="busca-ajuda"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Procure pelo que está tentando fazer: fiado, diferença no caixa, cupom…"
          className="input w-full"
        />
        {procurando && (
          <p className="mt-2 text-sm text-tenue" role="status">
            {achou === 0
              ? 'Nada encontrado. Tente a palavra que você usaria no balcão.'
              : `${achou} ${achou === 1 ? 'tela encontrada' : 'telas encontradas'}.`}
          </p>
        )}
      </div>

      {secoes.map((secao) => (
        <section key={secao.titulo} className="mt-7">
          <h2 className="rotulo-secao">{secao.titulo}</h2>

          <div className="mt-2 space-y-3">
            {secao.verbetes.map(({ item, topico }) => (
              <article key={item.href} id={ancora(item.href)} className="card scroll-mt-6">
                <div className="card-titulo">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="text-tenue">
                      <Icone nome={item.icone} />
                    </span>
                    <span className="titulo-secao truncate">{item.label}</span>
                  </span>
                  <Link href={item.href} className="link shrink-0 text-sm">
                    Abrir a tela
                  </Link>
                </div>

                <div className="px-4 py-3">
                  <p className="subtitulo">{topico.paraQue}</p>

                  {topico.duvidas.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {topico.duvidas.map((duvida) => (
                        // `<details>` nativo: abre com teclado, funciona sem
                        // JavaScript e não precisa de estado por pergunta.
                        // Fica aberto durante uma busca, senão o resultado
                        // apareceria com a resposta escondida — que é
                        // justamente o que a pessoa procurou.
                        <details
                          key={duvida.pergunta}
                          open={procurando}
                          className="group rounded-lg border border-linha/70"
                        >
                          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-texto transition hover:bg-realce">
                            <span className="mr-1.5 inline-block text-tenue transition-transform group-open:rotate-90">
                              ›
                            </span>
                            {duvida.pergunta}
                          </summary>
                          <p className="border-t border-linha/70 px-3 py-2.5 text-sm leading-relaxed text-suave">
                            {duvida.resposta}
                          </p>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      {secoes.length === 0 && !procurando && (
        <div className="estado-vazio mt-6">
          <p className="text-sm text-suave">Carregando a ajuda…</p>
        </div>
      )}

      <p className="mt-8 text-sm text-tenue">
        Atalho: <kbd className="rounded border border-linha px-1.5 py-0.5 text-xs">Ctrl</kbd> +{' '}
        <kbd className="rounded border border-linha px-1.5 py-0.5 text-xs">K</kbd> abre a busca de telas de qualquer
        lugar do sistema — inclusive esta, digitando “{AJUDA.label}”.
      </p>
    </div>
  );
}
