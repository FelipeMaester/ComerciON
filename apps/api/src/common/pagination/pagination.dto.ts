import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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

/**
 * Ordenação escolhida na tela, aplicada no banco.
 *
 * Vem separado do resto da paginação por um motivo prático: ordenar só as 25
 * linhas que chegaram é uma mentira convincente. Numa lista de 800 peças,
 * clicar em "Preço" e ver R$ 250 no topo passa a impressão de que aquela é a
 * peça mais cara do catálogo — quando é só a mais cara da página. Ordenar no
 * banco é o que torna a resposta verdadeira.
 */
export class OrdenacaoQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Coluna da tela pela qual ordenar (ex.: nome, preco)' })
  @IsOptional()
  @IsString()
  ordenarPor?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  direcao?: 'asc' | 'desc';
}

/**
 * Traduz a coluna pedida pela tela em um `orderBy` do Prisma.
 *
 * O mapa é uma lista branca, e é o ponto central deste helper: nome de coluna
 * chega pelo navegador, e jogar isso direto no `orderBy` deixaria o cliente
 * escolher ordenar por qualquer campo do banco — inclusive os que a tela nunca
 * mostra. Aqui só passa o que está escrito no mapa de cada listagem.
 *
 * Coluna desconhecida cai no padrão em vez de responder 400: a tela guarda a
 * última ordenação no navegador, e uma coluna renomeada numa versão seguinte
 * quebraria a lista de quem ainda tem a escolha antiga gravada. O caminho
 * aceita ponto (`customer.name`) para ordenar por campo de relação.
 */
export function montarOrdenacao<T>(query: OrdenacaoQueryDto, mapa: Record<string, string>, padrao: T): T {
  // hasOwnProperty, e não `mapa[chave]` direto: `?ordenarPor=__proto__`
  // devolve Object.prototype pela herança, que é um valor "verdadeiro" e passava
  // batido pela guarda — o `.split` logo abaixo estourava e a listagem
  // inteira respondia 500. Quem encontrou foi o teste da lista branca.
  const chave = query.ordenarPor;
  const caminho = chave && Object.prototype.hasOwnProperty.call(mapa, chave) ? mapa[chave] : undefined;
  if (typeof caminho !== 'string') return padrao;

  const direcao = query.direcao === 'desc' ? 'desc' : 'asc';
  // 'customer.name' vira { customer: { name: 'asc' } }; 'name' vira { name: 'asc' }.
  return caminho.split('.').reduceRight<unknown>((valor, parte) => ({ [parte]: valor }), direcao) as T;
}
