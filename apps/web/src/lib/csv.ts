import type { Coluna } from './tabela';

/**
 * Ponto-e-vírgula, e não vírgula.
 *
 * O Excel em português usa a vírgula como separador decimal, então um arquivo
 * separado por vírgula abre com "R$ 1" numa coluna e "189,90" na seguinte —
 * a planilha chega embaralhada e a pessoa conclui que o sistema exportou
 * errado. Com ponto-e-vírgula, o Excel brasileiro abre com um duplo clique.
 */
const SEPARADOR = ';';

/**
 * Marca de ordem de bytes (BOM) do UTF-8.
 *
 * Sem ela, o Excel lê o arquivo como ANSI e "Pastilha de freio dianteira" vira
 * "Pastilha de freio dianteira" com acento quebrado. São três bytes que
 * decidem se a planilha é utilizável.
 */
const BOM = '\uFEFF';

function escapar(valor: string): string {
  // Aspas dobradas e o campo inteiro entre aspas: é o que o formato pede
  // quando o conteúdo tem separador, aspas ou quebra de linha — um endereço
  // com ponto-e-vírgula não pode virar duas colunas.
  if (/[";\n\r]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

function comoTexto<T>(coluna: Coluna<T>, item: T): string {
  const valor = coluna.valor(item);
  if (valor === null || valor === undefined) return '';
  // Número com vírgula decimal, pelo mesmo motivo do separador: é assim que a
  // planilha brasileira entende 189,90 como número e consegue somar a coluna.
  if (coluna.numerica && typeof valor === 'number') return String(valor).replace('.', ',');
  return String(valor);
}

/**
 * Baixa como CSV exatamente o que está na tela.
 *
 * "O que está na tela" é literal: as colunas que a pessoa deixou visíveis, na
 * ordem em que ela ordenou, com os filtros que ela aplicou. Exportar a base
 * inteira quando a tela mostra 12 linhas filtradas seria entregar outra coisa
 * do que a pessoa pediu — e ela só descobriria ao abrir a planilha.
 *
 * A conversão acontece no navegador, sem endpoint novo: os dados já estão
 * aqui, e uma volta ao servidor só adicionaria espera e uma segunda regra de
 * filtro para manter em sincronia com a primeira.
 */
export function baixarCsv<T>(nomeBase: string, colunas: Coluna<T>[], itens: T[]): void {
  const cabecalho = colunas.map((c) => escapar(c.titulo)).join(SEPARADOR);
  const linhas = itens.map((item) => colunas.map((c) => escapar(comoTexto(c, item))).join(SEPARADOR));
  // \r\n: é o fim de linha que o Excel espera; com \n puro, algumas versões
  // colocam a planilha inteira numa única linha.
  const conteudo = BOM + [cabecalho, ...linhas].join('\r\n');

  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  // A data no nome evita que o download de amanhã sobrescreva o de hoje na
  // pasta de Downloads, que é onde esse arquivo vai parar.
  link.download = `${nomeBase}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Sem isto o blob fica na memória até a aba fechar — e quem exporta a lista
  // de peças várias vezes por dia deixa a aba pesada sem entender por quê.
  URL.revokeObjectURL(url);
}
