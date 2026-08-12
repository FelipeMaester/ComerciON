'use client';

import { useEffect } from 'react';

/**
 * Barra de ações das telas de impressão — some no papel (ver print.css).
 *
 * Dispara a janela de impressão sozinha assim que o documento termina de
 * carregar: quem clicou em "Imprimir cupom" no balcão quer o papel, não uma
 * prévia. `autoPrint` só é ligado depois que os dados chegaram, senão a
 * caixa de diálogo abriria sobre um documento em branco.
 */
export function PrintToolbar({ ready }: { ready: boolean }) {
  useEffect(() => {
    if (!ready) return;
    // Um quadro de atraso para o navegador terminar de pintar antes de
    // congelar tudo no diálogo de impressão.
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, [ready]);

  return (
    <div className="print-toolbar">
      <button type="button" className="primary" onClick={() => window.print()}>
        Imprimir
      </button>
      <button type="button" onClick={() => window.close()}>
        Fechar
      </button>
    </div>
  );
}
