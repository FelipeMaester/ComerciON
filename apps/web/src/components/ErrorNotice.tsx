'use client';

import Link from 'next/link';

// A mensagem vem direto do ForbiddenException do ModulesGuard (ver
// apps/api/src/common/guards/modules.guard.ts) — casar por esse trecho é
// simples e funciona porque o texto é nosso, dos dois lados.
const PLAN_LOCK_PHRASE = 'não está incluído no seu plano atual';

export function isPlanLockedError(message: string): boolean {
  return message.includes(PLAN_LOCK_PHRASE);
}

/**
 * Substituto do `<p className="text-red-600">{error}</p>` espalhado pelas
 * telas: continua mostrando um erro comum em vermelho, mas quando a causa é
 * o módulo estar fora do plano, troca para um aviso de upgrade com link
 * para /billing em vez de um erro vermelho genérico.
 */
export function ErrorNotice({ message, compact = true }: { message: string; compact?: boolean }) {
  if (!isPlanLockedError(message)) {
    return <p className="text-sm text-red-600 dark:text-red-400">{message}</p>;
  }

  if (compact) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-400">
        {message}{' '}
        <Link href="/billing" className="font-medium underline">
          Ver planos
        </Link>
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950">
      <p className="mb-3 text-sm text-amber-800 dark:text-amber-300">{message}</p>
      <Link href="/billing" className="btn-primary inline-block">
        Ver planos
      </Link>
    </div>
  );
}
