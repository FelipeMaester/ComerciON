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
