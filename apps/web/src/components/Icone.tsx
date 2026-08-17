/**
 * Ícones do menu.
 *
 * São SVGs escritos aqui em vez de uma biblioteca (lucide, heroicons) por um
 * motivo prático: o painel usa vinte ícones no total. Uma dependência a mais
 * para isso significa mais uma coisa para atualizar, auditar e carregar — e
 * traçados próprios garantem que todos tenham a mesma espessura e o mesmo peso
 * visual, que é o que faz uma lista de ícones parecer um conjunto.
 */

export type NomeDoIcone =
  | 'painel'
  | 'pdv'
  | 'caixa'
  | 'vendas'
  | 'orcamento'
  | 'ordem'
  | 'produto'
  | 'contagem'
  | 'fornecedor'
  | 'cliente'
  | 'whatsapp'
  | 'pipeline'
  | 'tarefa'
  | 'financeiro'
  | 'relatorio'
  | 'automacao'
  | 'cupom'
  | 'usuario'
  | 'assinatura'
  | 'administracao'
  | 'ia';

const TRACOS: Record<NomeDoIcone, JSX.Element> = {
  painel: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
    </>
  ),
  pdv: (
    <>
      <circle cx="9.5" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2.5 3.5h2.2l2.5 11.2a1.8 1.8 0 0 0 1.8 1.4h8.4a1.8 1.8 0 0 0 1.75-1.35L21 7.5H5.6" />
    </>
  ),
  caixa: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  vendas: (
    <>
      <path d="M6 2.8h12v18.4l-3-1.9-3 1.9-3-1.9-3 1.9z" />
      <path d="M9.2 8h5.6M9.2 12h5.6" />
    </>
  ),
  orcamento: (
    <>
      <path d="M13.8 2.8H7.2A2.2 2.2 0 0 0 5 5v14a2.2 2.2 0 0 0 2.2 2.2h9.6A2.2 2.2 0 0 0 19 19V8z" />
      <path d="M13.8 2.8V8H19" />
      <path d="M9 15.2l2 2 3.8-3.8" />
    </>
  ),
  ordem: (
    <>
      <rect x="5" y="4" width="14" height="17.2" rx="2.2" />
      <path d="M9.2 4V2.8h5.6V4" />
      <path d="M9 11.5h6M9 15.5h4" />
    </>
  ),
  produto: (
    <>
      <path d="M20.8 8.2v7.6L12 20.5l-8.8-4.7V8.2L12 3.5z" />
      <path d="M3.2 8.2L12 12.9l8.8-4.7M12 12.9v7.6" />
    </>
  ),
  contagem: (
    <>
      <rect x="5" y="4" width="14" height="17.2" rx="2.2" />
      <path d="M9.2 4V2.8h5.6V4" />
      <path d="M8.6 12.6l2 2 4.2-4.2" />
    </>
  ),
  fornecedor: (
    <>
      <path d="M2.8 6.2h10.4v9.6H2.8z" />
      <path d="M13.2 9.6h4.1l3 3.1v3.1h-7.1z" />
      <circle cx="7" cy="18.4" r="1.7" />
      <circle cx="17" cy="18.4" r="1.7" />
    </>
  ),
  cliente: (
    <>
      <circle cx="9.2" cy="8" r="3.4" />
      <path d="M2.8 20a6.4 6.4 0 0 1 12.8 0" />
      <path d="M16.2 5.2a3.4 3.4 0 0 1 0 5.6M17.6 14.4a6.4 6.4 0 0 1 3.6 5.6" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M21 11.4a8.6 8.6 0 0 1-12.6 7.7L3.2 20.6l1.6-5A8.6 8.6 0 1 1 21 11.4z" />
      <path d="M8.8 9.4c0 3 2.4 5.4 5.4 5.4" />
    </>
  ),
  pipeline: (
    <>
      <rect x="3" y="4" width="5" height="13" rx="1.6" />
      <rect x="9.5" y="4" width="5" height="16.4" rx="1.6" />
      <rect x="16" y="4" width="5" height="9" rx="1.6" />
    </>
  ),
  tarefa: (
    <>
      <path d="M10 6h10.5M10 12h10.5M10 18h10.5" />
      <path d="M3.2 6l1.4 1.4L7.4 4.6M3.2 12l1.4 1.4L7.4 10.6M3.2 18l1.4 1.4L7.4 16.6" />
    </>
  ),
  financeiro: (
    <>
      <rect x="2.5" y="5.4" width="19" height="13.2" rx="2.2" />
      <path d="M10 15.4V8.8h2.9a2 2 0 1 1 0 4H10l3.4 2.6" />
    </>
  ),
  relatorio: (
    <>
      <path d="M3 20.6h18" />
      <path d="M6.2 20.6V11M12 20.6V4.4M17.8 20.6v-6.4" />
    </>
  ),
  automacao: <path d="M13.4 2.6L4.6 13.8h6.2l-1.2 7.6 8.8-11.2h-6.2z" />,
  cupom: (
    <>
      <path d="M3 8.4A2 2 0 0 1 5 6.4h14a2 2 0 0 1 2 2v1.1a2.5 2.5 0 0 0 0 5v1.1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.1a2.5 2.5 0 0 0 0-5z" />
      <path d="M14.2 7.4v9.2" strokeDasharray="2.4 2.4" />
    </>
  ),
  usuario: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20.4a7 7 0 0 1 14 0" />
    </>
  ),
  assinatura: (
    <>
      <rect x="2.5" y="4.8" width="19" height="14.4" rx="2.4" />
      <path d="M2.5 9.8h19" />
      <path d="M6.2 15h4" />
    </>
  ),
  administracao: (
    <>
      <path d="M12 2.8l8 3v6.1c0 4.4-3.2 7.7-8 9.3-4.8-1.6-8-4.9-8-9.3V5.8z" />
      <path d="M9.2 12.2l2 2 3.6-3.9" />
    </>
  ),
  ia: (
    <>
      <path d="M11.4 3.2l1.7 4.5 4.5 1.7-4.5 1.7-1.7 4.5-1.7-4.5L5.2 9.4l4.5-1.7z" />
      <path d="M17.8 14.6l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
};

export function Icone({ nome, className = 'h-[18px] w-[18px]' }: { nome: NomeDoIcone; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {TRACOS[nome]}
    </svg>
  );
}
