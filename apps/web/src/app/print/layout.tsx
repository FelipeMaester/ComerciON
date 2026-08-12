import './print.css';

/**
 * Layout das telas de impressão.
 *
 * Fica FORA do grupo (dashboard) de propósito: aquele layout renderiza a
 * sidebar e a barra de topo, que sairiam impressas junto do cupom. Aqui a
 * página é só o documento.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="print-shell">{children}</div>;
}
