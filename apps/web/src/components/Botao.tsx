'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variante = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variante?: Variante;
  /** Mostra o giro e bloqueia o clique. */
  carregando?: boolean;
  pequeno?: boolean;
  icone?: ReactNode;
  className?: string;
}

const CLASSES: Record<Variante, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

/**
 * Botão com estado de carregamento.
 *
 * O padrão anterior era trocar o texto: "Salvar" virava "Salvando…". Isso muda
 * a largura do botão no meio do clique — ele encolhe ou cresce sob o dedo, e o
 * que estiver ao lado dança junto. Aqui o texto continua no lugar, com opacidade
 * reduzida, e o giro entra por cima. A largura não muda.
 *
 * O `aria-busy` é o que conta a mesma coisa para quem usa leitor de tela.
 */
export function Botao({
  variante = 'primary',
  carregando = false,
  pequeno = false,
  icone,
  disabled,
  children,
  className = '',
  ...resto
}: Props) {
  return (
    <button
      {...resto}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={`relative ${CLASSES[variante]} ${pequeno ? 'btn-sm' : ''} ${className}`}
    >
      <span className={`inline-flex items-center gap-2 transition-opacity ${carregando ? 'opacity-0' : ''}`}>
        {icone}
        {children}
      </span>
      {carregando && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Giro />
        </span>
      )}
    </button>
  );
}

/** Anel girando. `currentColor` para servir a qualquer variante do botão. */
export function Giro({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
