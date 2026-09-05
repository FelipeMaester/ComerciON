'use client';

import { ReactNode } from 'react';

/**
 * Confirmação de ação destrutiva, dentro da tela.
 *
 * POR QUE NÃO `window.confirm`
 * O diálogo nativo pode ser suprimido pelo navegador. Depois de algumas
 * confirmações seguidas, o Chrome oferece "impedir que esta página crie mais
 * diálogos" — e a partir daí `confirm()` devolve `false` na hora, sem mostrar
 * nada. O botão passa a não fazer absolutamente nada, sem explicação, para
 * sempre.
 *
 * Isso não é hipótese: aconteceu no fechamento de caixa, foi corrigido lá e em
 * Vendas, e as telas de Automações e Categorias ficaram para trás com o
 * `confirm()`. O relato que trouxe o defeito de volta foi "clico em excluir e
 * ela não exclui".
 *
 * O componente existe para a correção não depender de alguém lembrar de
 * copiá-la: quem precisar confirmar algo destrutivo usa isto, e o próximo caso
 * já nasce certo.
 *
 * Além de não sumir, a confirmação dentro da tela pode MOSTRAR o que vai
 * acontecer — o diálogo nativo só aceita uma frase, e uma frase genérica é
 * fácil de dispensar sem ler.
 */
export function ConfirmacaoNaTela({
  titulo,
  children,
  rotuloDeConfirmar,
  executando = false,
  aoConfirmar,
  aoCancelar,
}: {
  titulo: string;
  /** O que vai acontecer, em texto que a pessoa lê antes de decidir. */
  children: ReactNode;
  rotuloDeConfirmar: string;
  executando?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      // Clicar fora cancela — mas não durante a execução, para ninguém achar
      // que interrompeu algo que já está em curso.
      onClick={() => !executando && aoCancelar()}
    >
      <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-md p-5">
        <h2 className="text-base font-semibold text-texto">{titulo}</h2>
        <div className="mt-2 text-sm leading-relaxed text-suave">{children}</div>

        <div className="mt-5 flex flex-wrap gap-2">
          {/* autoFocus para quem usa teclado não ter de caçar o botão, e
              porque Esc/clicar fora já cancelam — o caminho perigoso exige um
              gesto deliberado, o seguro não. */}
          <button autoFocus onClick={aoConfirmar} disabled={executando} className="btn-danger">
            {executando ? 'Executando…' : rotuloDeConfirmar}
          </button>
          <button onClick={aoCancelar} disabled={executando} className="btn-secondary">
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
