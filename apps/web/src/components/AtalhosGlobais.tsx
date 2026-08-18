'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { carregarModulos } from '@/lib/loja';
import {
  ATALHOS_DE_TELA,
  ATALHOS_DO_PDV,
  ATALHOS_GERAIS,
  ESPERA_DA_SEQUENCIA,
  TECLA_INICIAL,
  digitandoEmCampo,
} from '@/lib/atalhos';
import type { ModuleKey } from '@/lib/types';

/**
 * Atalhos de teclado do painel e a tela que os ensina.
 *
 * O sistema já tinha atalhos no PDV, mas navegar entre telas exigia mouse — e
 * quem atende no balcão passa o dia entre PDV, Produtos e Clientes. `g` e
 * depois a inicial do destino resolve sem tirar a mão do teclado.
 *
 * A tela de ajuda existe pelo mesmo motivo do botão "Ir para…" ao lado do
 * Ctrl+K: atalho que ninguém descobre é atalho que não existe. Abre com `?`,
 * que é onde todo mundo já procura.
 *
 * Os atalhos respeitam o plano: sem o módulo Financeiro, `g f` não leva a uma
 * tela que vai dar 403 — simplesmente não faz nada, e a ajuda nem lista.
 */
export function AtalhosGlobais() {
  const router = useRouter();
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const [modulos, setModulos] = useState<ModuleKey[] | null>(null);
  // Guarda o instante em que `g` foi pressionado. Ref, e não estado: mudar
  // estado a cada tecla causaria um render por tecla digitada na tela toda.
  const aguardando = useRef<number | null>(null);

  useEffect(() => {
    carregarModulos()
      .then(setModulos)
      .catch(() => setModulos(null));
  }, []);

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        setAjudaAberta(false);
        aguardando.current = null;
        return;
      }

      // Combinação com modificador é de outra pessoa (Ctrl+K é da paleta, e o
      // navegador tem as suas). Aqui só teclas soltas.
      if (evento.ctrlKey || evento.metaKey || evento.altKey) return;
      if (digitandoEmCampo(evento.target)) return;

      // `?` exige Shift no teclado ABNT, então é a tecla, não o código.
      if (evento.key === '?') {
        evento.preventDefault();
        setAjudaAberta((v) => !v);
        return;
      }

      const agora = Date.now();
      const emSequencia = aguardando.current !== null && agora - aguardando.current < ESPERA_DA_SEQUENCIA;

      if (!emSequencia) {
        aguardando.current = evento.key.toLowerCase() === TECLA_INICIAL ? agora : null;
        return;
      }

      aguardando.current = null;
      const atalho = ATALHOS_DE_TELA.find((a) => a.tecla === evento.key.toLowerCase());
      if (!atalho) return;
      // Módulo desligado no plano: o atalho simplesmente não leva a lugar
      // nenhum, em vez de levar a um 403.
      if (atalho.module && modulos && !modulos.includes(atalho.module)) return;

      evento.preventDefault();
      setAjudaAberta(false);
      router.push(atalho.href);
    }

    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [router, modulos]);

  if (!ajudaAberta) return null;

  const telas = ATALHOS_DE_TELA.filter((a) => !a.module || !modulos || modulos.includes(a.module));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Atalhos de teclado"
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={() => setAjudaAberta(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-linha bg-superficie shadow-flutuante"
      >
        <div className="flex items-center justify-between border-b border-linha px-5 py-3">
          <h2 className="text-sm font-semibold text-texto">Atalhos de teclado</h2>
          <button onClick={() => setAjudaAberta(false)} className="btn-icone" aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <Secao titulo="Ir para a tela" nota={`Aperte ${TECLA_INICIAL.toUpperCase()} e depois a letra`}>
            {telas.map((atalho) => (
              <Linha key={atalho.tecla} teclas={[TECLA_INICIAL.toUpperCase(), atalho.tecla.toUpperCase()]} rotulo={atalho.rotulo} />
            ))}
          </Secao>

          <Secao titulo="No PDV" nota="Teclas de função, valem com o cursor no campo">
            {ATALHOS_DO_PDV.map((a) => (
              <Linha key={a.teclas} teclas={[a.teclas]} rotulo={a.rotulo} />
            ))}
          </Secao>

          <Secao titulo="Em qualquer lugar">
            {ATALHOS_GERAIS.map((a) => (
              <Linha key={a.teclas} teclas={a.teclas.split(' ')} rotulo={a.rotulo} />
            ))}
          </Secao>
        </div>
      </div>
    </div>
  );
}

function Secao({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-tenue">{titulo}</h3>
        {nota && <span className="text-[11px] text-tenue">— {nota}</span>}
      </div>
      <ul className="space-y-1">{children}</ul>
    </section>
  );
}

function Linha({ teclas, rotulo }: { teclas: string[]; rotulo: string }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg px-2 py-1 text-sm hover:bg-realce">
      <span className="text-texto">{rotulo}</span>
      <span className="flex shrink-0 gap-1">
        {teclas.map((tecla) => (
          <kbd
            key={tecla}
            className="rounded border border-linha bg-realce px-1.5 py-0.5 font-sans text-[11px] text-suave"
          >
            {tecla}
          </kbd>
        ))}
      </span>
    </li>
  );
}
