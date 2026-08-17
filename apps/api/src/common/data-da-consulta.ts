import { BadRequestException } from '@nestjs/common';

/**
 * Converte uma data vinda da query string, recusando lixo com 400.
 *
 * `new Date('banana')` devolve Invalid Date em silêncio, e o Prisma só
 * reclama lá na frente — o usuário recebia 500 em quatro rotas de relatório
 * e financeiro, inclusive ao abrir `/finance/cashflow` sem parâmetro nenhum.
 * Data inválida é erro de quem chamou, não defeito de servidor.
 */
export function dataDaConsulta(valor: string | undefined | null, campo: string): Date {
  const data = interpretar(valor);
  if (!data) throw new BadRequestException(`Parâmetro "${campo}" precisa ser uma data válida (ex.: 2026-08-17)`);
  return data;
}

/** Versão para parâmetro opcional: ausente vira undefined, presente e inválido ainda é 400. */
export function dataOpcionalDaConsulta(valor: string | undefined | null, campo: string): Date | undefined {
  if (valor === undefined || valor === null || valor.trim() === '') return undefined;
  return dataDaConsulta(valor, campo);
}

/**
 * Fim do período: `2026-08-17` vira 2026-08-17T23:59:59.999, não meia-noite.
 *
 * Quem escolhe "de 01/08 até 17/08" está incluindo o dia 17. Com `new Date()`
 * puro, o 17 virava 00:00 e a comparação `lte` cortava o dia inteiro — o fluxo
 * de caixa mostrava R$ 0,00 num dia com vendas, e a tela, que abre no mês
 * corrente, escondia tudo o que foi pago no último dia do mês.
 *
 * Data com hora explícita é respeitada como veio: quem mandou um instante
 * quis aquele instante.
 */
export function fimDoDiaDaConsulta(valor: string | undefined | null, campo: string): Date {
  const data = dataDaConsulta(valor, campo);
  const soData = typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim());
  if (soData) data.setHours(23, 59, 59, 999);
  return data;
}

/** Versão opcional de fimDoDiaDaConsulta. */
export function fimDoDiaOpcional(valor: string | undefined | null, campo: string): Date | undefined {
  if (valor === undefined || valor === null || valor.trim() === '') return undefined;
  return fimDoDiaDaConsulta(valor, campo);
}

/** `2026-08-17` — só data, sem hora. */
const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Data pura é interpretada no fuso do servidor, não em UTC.
 *
 * `new Date('2026-08-17')` é meia-noite UTC pela especificação — que no Brasil
 * (UTC-3) é dia 16 às 21h. Sem isto, "de 01/08 até 31/08" começava às 21h de
 * 31/07 e terminava às 21h de 30/08: a loja via venda do mês passado dentro do
 * mês e perdia as três últimas horas do último dia. O dashboard já trabalha em
 * dias locais, então esta é também a leitura que mantém as telas coerentes.
 */
function interpretar(valor: string | undefined | null): Date | null {
  if (valor === undefined || valor === null || valor.trim() === '') return null;
  const texto = valor.trim();

  const soData = SO_DATA.exec(texto);
  if (soData) {
    const [, ano, mes, dia] = soData;
    const data = new Date(Number(ano), Number(mes) - 1, Number(dia));
    // Barra 2026-02-31 e afins: o construtor "corrige" para março em silêncio.
    if (data.getMonth() !== Number(mes) - 1 || data.getDate() !== Number(dia)) return null;
    return data;
  }

  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : data;
}
