'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Tom = 'ok' | 'erro' | 'info';

interface Aviso {
  id: number;
  tom: Tom;
  texto: string;
}

const Contexto = createContext<(texto: string, tom?: Tom) => void>(() => {});

/**
 * Confirmação passageira no canto da tela.
 *
 * Substitui o "Meta salva." que ficava pendurado embaixo do formulário para
 * sempre: quem salva a mesma coisa duas vezes não vê diferença nenhuma na
 * segunda, porque a mensagem já estava lá. O aviso que aparece e some tem
 * início e fim, então o segundo salvamento também é percebido.
 *
 * Não substitui o ErrorNotice das telas: erro que exige ação continua fixo
 * junto do campo. Aqui vai o que é só confirmação.
 */
export function ProvedorDeAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const avisar = useCallback((texto: string, tom: Tom = 'ok') => {
    // Date.now() repetiria a chave em dois avisos no mesmo milissegundo.
    const id = Math.random();
    setAvisos((atuais) => [...atuais, { id, tom, texto }]);
  }, []);

  const remover = useCallback((id: number) => {
    setAvisos((atuais) => atuais.filter((a) => a.id !== id));
  }, []);

  return (
    <Contexto.Provider value={avisar}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      >
        {avisos.map((aviso) => (
          <Cartao key={aviso.id} aviso={aviso} aoSumir={() => remover(aviso.id)} />
        ))}
      </div>
    </Contexto.Provider>
  );
}

const ESTILO: Record<Tom, { classe: string; icone: ReactNode }> = {
  ok: {
    classe: 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
    icone: <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />,
  },
  erro: {
    classe: 'border-red-500/30 text-red-700 dark:text-red-300',
    icone: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.007M12 3l9 16.5H3L12 3z" />,
  },
  info: {
    classe: 'border-marca/30 text-marca-legivel',
    icone: <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25h1.5v5.25m-.75-9h.007" />,
  },
};

function Cartao({ aviso, aoSumir }: { aviso: Aviso; aoSumir: () => void }) {
  useEffect(() => {
    const relogio = setTimeout(aoSumir, 3600);
    return () => clearTimeout(relogio);
  }, [aoSumir]);

  const { classe, icone } = ESTILO[aviso.tom];

  return (
    <div
      role="status"
      onClick={aoSumir}
      className={`pointer-events-auto flex animate-surgir cursor-pointer items-start gap-2.5 rounded-xl border bg-superficie px-3.5 py-2.5 shadow-flutuante ${classe}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0">
        {icone}
      </svg>
      <span className="text-sm text-texto">{aviso.texto}</span>
    </div>
  );
}

/** `const avisar = useAviso(); avisar('Meta salva.')` */
export function useAviso() {
  return useContext(Contexto);
}
