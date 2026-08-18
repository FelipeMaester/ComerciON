import type { ModuleKey } from './types';

export interface AtalhoDeTela {
  /** Segunda tecla da sequência: `g` e depois esta. */
  tecla: string;
  rotulo: string;
  href: string;
  /** Módulo do plano que libera a tela. Ausente = sempre disponível. */
  module?: ModuleKey;
}

/**
 * A primeira tecla da sequência. `g` de "go", o mesmo que Gmail e GitHub usam.
 *
 * Sequência de duas teclas, e não Ctrl/Alt+letra, por dois motivos: as
 * combinações com Alt abrem o menu do navegador em Windows, e as com Ctrl já
 * estão quase todas tomadas (Ctrl+P imprime, Ctrl+S salva a página). `g`
 * sozinho não faz nada em lugar nenhum.
 */
export const TECLA_INICIAL = 'g';

/**
 * Quanto tempo a sequência espera pela segunda tecla.
 *
 * Um segundo e meio: tempo de quem sabe o atalho e está digitando, mas curto o
 * bastante para que um `g` digitado por engano não capture a letra seguinte de
 * uma palavra sendo escrita fora de um campo.
 */
export const ESPERA_DA_SEQUENCIA = 1500;

/**
 * Para onde `g` + tecla leva.
 *
 * A tecla é a inicial do destino sempre que possível (p de produtos, c de
 * clientes) — atalho que exige decorar um mapa arbitrário ninguém usa. Onde a
 * inicial já estava tomada, vale a segunda letra mais reconhecível: `x` de
 * caixa, `s` de ordens de serviço.
 */
export const ATALHOS_DE_TELA: AtalhoDeTela[] = [
  { tecla: 'd', rotulo: 'Dashboard', href: '/dashboard' },
  { tecla: 'v', rotulo: 'PDV (venda rápida)', href: '/pos', module: 'SALES' },
  { tecla: 'x', rotulo: 'Caixa', href: '/cash', module: 'SALES' },
  { tecla: 'p', rotulo: 'Produtos e estoque', href: '/products', module: 'INVENTORY' },
  { tecla: 'c', rotulo: 'Clientes', href: '/customers', module: 'CRM' },
  { tecla: 'f', rotulo: 'Financeiro', href: '/finance', module: 'FINANCE' },
  { tecla: 's', rotulo: 'Ordens de serviço', href: '/service-orders', module: 'SALES' },
  { tecla: 'a', rotulo: 'Vendas', href: '/sales', module: 'SALES' },
  { tecla: 't', rotulo: 'Tarefas', href: '/tasks', module: 'CRM' },
];

/** Atalhos que não navegam — os que a tela de ajuda também precisa ensinar. */
export const ATALHOS_GERAIS: { teclas: string; rotulo: string }[] = [
  { teclas: 'Ctrl K', rotulo: 'Ir para… (busca peça, cliente e tela)' },
  { teclas: '?', rotulo: 'Mostrar esta lista de atalhos' },
  { teclas: 'Esc', rotulo: 'Fechar o que estiver aberto' },
];

/** Os do balcão, que valem dentro do PDV. Espelham SHORTCUTS em pos/page.tsx. */
export const ATALHOS_DO_PDV: { teclas: string; rotulo: string }[] = [
  { teclas: 'F2', rotulo: 'Buscar produto' },
  { teclas: 'F3', rotulo: 'Escolher o cliente' },
  { teclas: 'F4', rotulo: 'Ir para o pagamento' },
  { teclas: 'F9', rotulo: 'Finalizar a venda' },
];

/**
 * Se o atalho deve ser ignorado porque a pessoa está digitando.
 *
 * Sem isto, escrever "pastilha" no campo de busca dispararia o atalho de
 * Produtos no `p` — o sistema navegaria sozinho no meio de uma palavra.
 *
 * Teclas de função ficam de fora desta regra (e por isso não passam por aqui):
 * o F2 do balcão existe justamente para ser apertado com o cursor dentro de
 * um campo.
 */
export function digitandoEmCampo(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  if (alvo.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName);
}
