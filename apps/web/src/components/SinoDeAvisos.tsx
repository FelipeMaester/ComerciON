'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api-client';
import type { Aviso, SeveridadeDoAviso } from '@/lib/types';

/**
 * De quanto em quanto tempo o sino se atualiza sozinho.
 *
 * Cinco minutos: um aviso destes muda de estado em escala de horas (conta
 * vence à meia-noite, peça acaba durante o dia), e cada consulta é uma
 * requisição por pessoa logada. Além disso o sino recarrega quando a janela
 * volta ao foco, que é quando alguém de fato volta a olhar para a tela.
 */
const INTERVALO = 5 * 60 * 1000;

const CORES: Record<SeveridadeDoAviso, { ponto: string; texto: string }> = {
  urgente: { ponto: 'bg-red-500', texto: 'text-red-600 dark:text-red-400' },
  atencao: { ponto: 'bg-amber-500', texto: 'text-amber-600 dark:text-amber-400' },
  informativo: { ponto: 'bg-marca-solida', texto: 'text-suave' },
};

/**
 * O que precisa de atenção hoje, no alto da tela.
 *
 * O sistema era inteiramente passivo: conta vencida, peça abaixo do mínimo e
 * OS atrasada existiam no banco e só apareciam para quem abrisse a tela certa
 * e reparasse. Quem trabalha no balcão não abre o Financeiro "para ver se tem
 * algo" — descobre quando o fornecedor liga.
 *
 * Cada linha é um link para a tela que resolve, já filtrada: aviso que obriga
 * a procurar o que ele mesmo acabou de contar não economiza trabalho nenhum.
 */
export function SinoDeAvisos() {
  const [avisos, setAvisos] = useState<Aviso[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const carregar = useCallback(() => {
    api
      .get<{ avisos: Aviso[] }>('/alerts')
      .then((dados) => setAvisos(dados.avisos))
      // Sino é acessório: se falhar, o painel continua inteiro e ele apenas
      // não aparece. Um erro vermelho no topo por causa disso seria pior que
      // o silêncio.
      .catch(() => setAvisos(null));
  }, []);

  useEffect(() => {
    carregar();
    const relogio = setInterval(carregar, INTERVALO);
    // `focus` e não `visibilitychange`: quem volta de outra aba ou de outro
    // programa é quem vai olhar agora.
    window.addEventListener('focus', carregar);
    return () => {
      clearInterval(relogio);
      window.removeEventListener('focus', carregar);
    };
  }, [carregar]);

  // Navegou? Fecha, e recarrega: a pessoa provavelmente acabou de resolver
  // aquilo que o aviso apontava.
  useEffect(() => {
    setAberto(false);
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    function aoClicarFora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    window.addEventListener('keydown', aoTeclar);
    document.addEventListener('mousedown', aoClicarFora);
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('mousedown', aoClicarFora);
    };
  }, [aberto]);

  const total = avisos?.length ?? 0;
  const urgentes = avisos?.filter((a) => a.severidade === 'urgente').length ?? 0;

  return (
    <div ref={caixa} className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        className="btn-icone relative"
        aria-expanded={aberto}
        aria-label={total > 0 ? `Avisos: ${total} ${total === 1 ? 'item' : 'itens'}` : 'Avisos: tudo em dia'}
        title="Avisos"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>
        {total > 0 && (
          // O número diz quantos; a cor diz se dá para deixar para depois.
          <span
            className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white ${
              urgentes > 0 ? 'bg-red-500' : 'bg-amber-500'
            }`}
          >
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Avisos da loja"
          className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-linha bg-superficie shadow-flutuante"
        >
          <div className="flex items-center justify-between border-b border-linha px-4 py-2.5">
            <span className="text-sm font-semibold text-texto">Avisos</span>
            <span className="text-xs text-tenue">{total > 0 ? `${total} para hoje` : 'nada pendente'}</span>
          </div>

          {avisos === null ? (
            <p className="px-4 py-6 text-center text-sm text-tenue">Não foi possível carregar os avisos.</p>
          ) : total === 0 ? (
            <div className="px-4 py-8 text-center">
              <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </span>
              <p className="text-sm font-medium text-texto">Tudo em dia</p>
              <p className="mt-0.5 text-xs text-tenue">Sem contas vencidas, peça em falta ou serviço atrasado.</p>
            </div>
          ) : (
            <ul className="max-h-[min(26rem,60vh)] divide-y divide-linha overflow-y-auto">
              {avisos.map((aviso) => (
                <li key={aviso.chave}>
                  <Link
                    href={aviso.rota}
                    onClick={() => setAberto(false)}
                    className="flex gap-3 px-4 py-3 transition-colors hover:bg-realce"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${CORES[aviso.severidade].ponto}`} />
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium ${CORES[aviso.severidade].texto}`}>
                        {aviso.titulo}
                      </span>
                      <span className="block text-xs leading-snug text-tenue">{aviso.detalhe}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
