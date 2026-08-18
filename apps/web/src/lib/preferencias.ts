/**
 * Preferências de quem usa o sistema.
 *
 * Ficam no navegador, não no banco: são de PESSOA, não de loja. Duas pessoas
 * no mesmo balcão, cada uma no seu computador, podem querer coisas diferentes
 * — e nenhuma delas quer pedir para o administrador mudar isso.
 *
 * O que é da loja (cor da marca, logo, taxas) continua em Configurações, salvo
 * na API, valendo para todo mundo.
 */

export type Tema = 'claro' | 'escuro' | 'sistema';
export type Densidade = 'confortavel' | 'compacta';

export interface Preferencias {
  tema: Tema;
  densidade: Densidade;
  /** Rota que abre depois do login. */
  telaInicial: string;
  /** Desliga as animações mesmo que o sistema operacional não peça. */
  movimentoReduzido: boolean;
}

export const PREFERENCIAS_PADRAO: Preferencias = {
  // "sistema" como padrão: acompanhar o computador é o que a pessoa espera
  // antes de escolher qualquer coisa.
  tema: 'sistema',
  densidade: 'confortavel',
  telaInicial: '/dashboard',
  movimentoReduzido: false,
};

const CHAVE = 'comercion.preferencias';

/** Chave da versão anterior, que só guardava 'light' | 'dark'. */
const CHAVE_ANTIGA = 'erp.theme';

/**
 * Telas que fazem sentido como ponto de partida.
 *
 * Não é a lista inteira do menu: abrir o sistema direto na tela de Usuários
 * não é o pedido de ninguém. São as telas onde o dia começa.
 */
export const TELAS_INICIAIS: { valor: string; rotulo: string; descricao: string }[] = [
  { valor: '/dashboard', rotulo: 'Visão geral', descricao: 'como a loja está hoje e no mês' },
  { valor: '/pos', rotulo: 'PDV', descricao: 'para quem abre o sistema para vender' },
  { valor: '/sales', rotulo: 'Vendas', descricao: 'a lista do que foi vendido' },
  { valor: '/service-orders', rotulo: 'Ordens de serviço', descricao: 'o que está na bancada' },
  { valor: '/products', rotulo: 'Produtos e estoque', descricao: 'para quem cuida das peças' },
];

function ehTema(v: unknown): v is Tema {
  return v === 'claro' || v === 'escuro' || v === 'sistema';
}

function ehDensidade(v: unknown): v is Densidade {
  return v === 'confortavel' || v === 'compacta';
}

export function lerPreferencias(): Preferencias {
  if (typeof window === 'undefined') return PREFERENCIAS_PADRAO;

  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (bruto) {
      const salvo = JSON.parse(bruto) as Partial<Preferencias>;
      return {
        tema: ehTema(salvo.tema) ? salvo.tema : PREFERENCIAS_PADRAO.tema,
        densidade: ehDensidade(salvo.densidade) ? salvo.densidade : PREFERENCIAS_PADRAO.densidade,
        // Só aceita rota da lista: valor inventado no localStorage mandaria a
        // pessoa para uma tela que não existe, logo depois de entrar.
        telaInicial: TELAS_INICIAIS.some((t) => t.valor === salvo.telaInicial)
          ? (salvo.telaInicial as string)
          : PREFERENCIAS_PADRAO.telaInicial,
        movimentoReduzido: salvo.movimentoReduzido === true,
      };
    }

    // Quem já tinha escolhido claro/escuro na versão anterior não perde a
    // escolha — ela vira a preferência nova, uma vez só.
    const antigo = window.localStorage.getItem(CHAVE_ANTIGA);
    if (antigo === 'light') return { ...PREFERENCIAS_PADRAO, tema: 'claro' };
    if (antigo === 'dark') return { ...PREFERENCIAS_PADRAO, tema: 'escuro' };
  } catch {
    // localStorage bloqueado (modo privado) ou JSON corrompido: os padrões
    // servem, e o sistema continua utilizável.
  }

  return PREFERENCIAS_PADRAO;
}

export function salvarPreferencias(prefs: Preferencias): void {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(prefs));
    // A chave antiga vira ruído depois da migração.
    window.localStorage.removeItem(CHAVE_ANTIGA);
  } catch {
    // Sem localStorage as preferências valem só nesta aba. Melhor que travar.
  }
}

function sistemaPreferEscuro(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** O tema que a tela realmente mostra agora — 'sistema' já resolvido. */
export function temaEfetivo(tema: Tema): 'claro' | 'escuro' {
  if (tema === 'sistema') return sistemaPreferEscuro() ? 'escuro' : 'claro';
  return tema;
}

export function aplicarPreferencias(prefs: Preferencias): void {
  const raiz = document.documentElement;
  raiz.classList.toggle('dark', temaEfetivo(prefs.tema) === 'escuro');
  raiz.dataset.densidade = prefs.densidade;
  // Um atributo em vez de uma classe: o CSS de movimento reduzido já consulta
  // a media query, e este é o segundo caminho para a mesma regra.
  if (prefs.movimentoReduzido) raiz.dataset.movimento = 'reduzido';
  else delete raiz.dataset.movimento;
}

/**
 * Reage à troca de tema do sistema operacional enquanto a página está aberta.
 *
 * Sem isto, escolher "seguir o sistema" só funcionaria até a próxima recarga:
 * quem usa o modo automático do Windows veria o painel continuar claro depois
 * do anoitecer. Devolve a função que cancela a escuta.
 */
export function observarTemaDoSistema(aoMudar: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const consulta = window.matchMedia('(prefers-color-scheme: dark)');
  consulta.addEventListener('change', aoMudar);
  return () => consulta.removeEventListener('change', aoMudar);
}

/**
 * Script que roda antes da primeira pintura, no <head>.
 *
 * Sem ele a página nasce clara e vira escura depois que o React monta — um
 * flash branco na cara de quem escolheu o tema escuro. Precisa ser inline e
 * síncrono, e por isso repete a lógica acima em vez de importá-la.
 */
export const SCRIPT_DE_INICIO = `
(function () {
  try {
    var raiz = document.documentElement;
    var prefs = {};
    try { prefs = JSON.parse(localStorage.getItem('${CHAVE}')) || {}; } catch (e) {}

    var tema = prefs.tema;
    if (tema !== 'claro' && tema !== 'escuro' && tema !== 'sistema') {
      var antigo = localStorage.getItem('${CHAVE_ANTIGA}');
      tema = antigo === 'light' ? 'claro' : antigo === 'dark' ? 'escuro' : 'sistema';
    }
    var escuro = tema === 'escuro' ||
      (tema === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (escuro) raiz.classList.add('dark');

    raiz.dataset.densidade = prefs.densidade === 'compacta' ? 'compacta' : 'confortavel';
    if (prefs.movimentoReduzido === true) raiz.dataset.movimento = 'reduzido';
  } catch (e) {}
})();
`;
