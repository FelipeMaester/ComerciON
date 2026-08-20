/**
 * Dinheiro em português.
 *
 * O painel inteiro escrevia `R$ ${valor.toFixed(2)}`, que produz
 * "R$ 10560.41" — separador de milhar nenhum e ponto no lugar da vírgula.
 * Para quem lê um relatório de faturamento, isso não é só feio: é lento de
 * conferir e fácil de ler errado (10.560 vira "dez mil quinhentos" só depois
 * de contar os dígitos com o dedo).
 *
 * O `Intl` cuida do formato oficial: R$ 10.560,41.
 */
const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarMoeda(valor: number | string | null | undefined): string {
  const numero = Number(valor ?? 0);
  return MOEDA.format(Number.isFinite(numero) ? numero : 0);
}

/** Quantidade/contagem com separador de milhar: 1.240 em vez de 1240. */
export function formatarNumero(valor: number | string | null | undefined, casas = 0): string {
  const numero = Number(valor ?? 0);
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(Number.isFinite(numero) ? numero : 0);
}

/**
 * Dinheiro abreviado, para o eixo do gráfico.
 *
 * O eixo vertical não tem largura para "R$ 12.500,00" — cinco marcas assim
 * comem um terço do gráfico. "12,5 mil" diz a mesma coisa em metade do espaço.
 * Só para eixo e legenda: em tabela e total, o valor vai por extenso.
 */
export function formatarMoedaCurta(valor: number): string {
  const absoluto = Math.abs(valor);
  if (absoluto >= 1_000_000) return `R$ ${formatarNumero(valor / 1_000_000, 1)} mi`;
  if (absoluto >= 1_000) return `R$ ${formatarNumero(valor / 1_000, absoluto >= 10_000 ? 0 : 1)} mil`;
  return `R$ ${formatarNumero(valor, 0)}`;
}

/** "14/08" — rótulo do eixo horizontal, a partir de "2026-08-14". */
export function diaCurto(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

/** "quinta, 14 de agosto" — o mesmo dia, por extenso, para o balão do gráfico. */
export function diaPorExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Formas de pagamento em português — a mesma lista que o PDV usa. */
export const FORMA_DE_PAGAMENTO: Record<string, string> = {
  CASH: 'Dinheiro',
  DEBIT_CARD: 'Cartão de débito',
  CREDIT_CARD: 'Cartão de crédito',
  PIX: 'PIX',
  BOLETO: 'Boleto',
  FIADO: 'Fiado',
};

export function formaDePagamento(valor: string): string {
  return FORMA_DE_PAGAMENTO[valor] ?? valor;
}

/**
 * O papel de quem usa o sistema, em português.
 *
 * A tela de Usuários mostrava "ADMIN" e "SALES" crus, como saem do banco — e o
 * mesmo valor aparecia traduzido no menu lateral, porque lá existia um mapa
 * privado. Dois lugares, duas respostas para a mesma pergunta; agora é um só.
 */
export const PAPEL: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Administrador',
  SALES: 'Vendas',
  FINANCE: 'Financeiro',
  INVENTORY: 'Estoque',
  SUPPORT: 'Suporte',
};

export function papel(valor: string): string {
  return PAPEL[valor] ?? valor;
}

/**
 * Os módulos do sistema, em português.
 *
 * A tela de Planos listava o que cada plano inclui com o nome interno de cada
 * módulo: "• INVENTORY", "• SUPPLIERS". Quem está decidindo se paga mais caro
 * precisa ler o que vai levar.
 */
export const MODULO: Record<string, string> = {
  CRM: 'Clientes e funil de vendas',
  INVENTORY: 'Estoque',
  SUPPLIERS: 'Fornecedores',
  SALES: 'Vendas e PDV',
  FINANCE: 'Financeiro',
  FISCAL: 'Notas fiscais',
  WHATSAPP: 'WhatsApp',
  BI: 'Relatórios',
  AI: 'Inteligência artificial',
  AUTOMATIONS: 'Automações',
  // Restos da loja virtual, que não existe mais. Continuam no enum do banco
  // porque removê-los custa migração e não muda nada; traduzidos por garantia,
  // já que uma instalação antiga ainda pode ter um plano que os cite.
  ECOMMERCE: 'Loja virtual',
  LOGISTICS: 'Logística',
  MARKETING: 'Marketing',
};

export function modulo(valor: string): string {
  return MODULO[valor] ?? valor;
}

/**
 * O tipo da nota fiscal, escrito como a legislação escreve.
 *
 * O banco guarda NFE e NFCE; no papel e na conversa é "NF-e" e "NFC-e".
 */
export const TIPO_DE_NOTA: Record<string, string> = {
  NFE: 'NF-e',
  NFCE: 'NFC-e',
};

export function tipoDeNota(valor: string): string {
  return TIPO_DE_NOTA[valor] ?? valor;
}

/**
 * Segmento do cliente em português.
 *
 * A tela mostrava "NEW" e "RECURRING" cru, como saem do banco. É jargão de
 * quem escreveu o schema, não do balconista que abre a lista de clientes.
 */
export const SEGMENTO_DO_CLIENTE: Record<string, string> = {
  NEW: 'Novo',
  RECURRING: 'Recorrente',
  VIP: 'VIP',
  DELINQUENT: 'Inadimplente',
};

export function segmentoDoCliente(valor: string): string {
  return SEGMENTO_DO_CLIENTE[valor] ?? valor;
}

/** `70653953-84f5-49f1-baab-6be3cc01b4da` — o formato que o banco gera para id. */
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * Encurta identificadores dentro de um texto para leitura humana.
 *
 * O Financeiro mostrava "Venda 70653953-84f5-49f1-baab-6be3cc01b4da" — 36
 * caracteres que ninguém lê, que quebram a linha em quatro e escondem o que
 * importa (o valor, o vencimento). Os 8 primeiros já identificam a venda para
 * quem vai conferir, e é assim que a lista de vendas sempre mostrou.
 *
 * Só muda a exibição: o texto guardado continua completo.
 */
export function encurtarIds(texto: string): string {
  return texto.replace(UUID, (id) => id.slice(0, 8));
}

// Datas "de calendário" (vencimento, sem hora significativa) são armazenadas
// como meia-noite UTC. Formatar com o fuso local do navegador pode exibir o
// dia anterior (ex: usuário em UTC-3 vê 09/08 para um vencimento em 10/08).
// Forçar timeZone: 'UTC' aqui mantém a data como foi digitada.
export function formatCalendarDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}
