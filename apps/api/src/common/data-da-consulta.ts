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

function interpretar(valor: string | undefined | null): Date | null {
  if (valor === undefined || valor === null || valor.trim() === '') return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}
