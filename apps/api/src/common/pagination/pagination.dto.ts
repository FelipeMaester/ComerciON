import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Itens por página quando o cliente não pede nada. */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Teto absoluto de itens por página.
 *
 * Existe para que `?pageSize=999999` não recrie exatamente o problema que a
 * paginação veio resolver: uma consulta que devolve a tabela inteira.
 *
 * Pedir mais que isto responde 400, não corta em silêncio: quem pediu 1.000
 * itens e recebesse 100 sem aviso concluiria que só existem 100.
 */
export const MAX_PAGE_SIZE = 100;

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}

/** Envelope de toda listagem paginada da API. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Converte page/pageSize em skip/take, aplicando limites.
 *
 * Centralizado de propósito: espalhar `Math.min(pageSize, 100)` por cada
 * service é como o teto acaba esquecido em um deles.
 */
export function toSkipTake(query: PaginationQueryDto): { skip: number; take: number; page: number; pageSize: number } {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
