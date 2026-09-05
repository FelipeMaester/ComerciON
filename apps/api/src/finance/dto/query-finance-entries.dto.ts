import { ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialEntryStatus, FinancialEntryType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';

/**
 * Filtros da listagem do financeiro.
 *
 * Estende PaginationQueryDto em vez de somar `@Query('type')` soltos ao lado
 * dele: o ValidationPipe roda com `forbidNonWhitelisted`, então TODO parâmetro
 * precisa estar declarado no MESMO DTO — um parâmetro não declarado vira 400,
 * não vira "ignorado".
 *
 * O projeto já tinha aprendido isso em query-products.dto.ts, com o aviso
 * escrito no arquivo. Repeti o erro mesmo assim: a primeira versão desta
 * paginação misturava `@Query() paginacao` com os `@Query('type')` antigos, e
 * `?type=RECEIVABLE` — o filtro "contas a receber", que é metade do uso da
 * tela — passou a responder 400. Apareceu na medição, não na revisão.
 */
export class QueryFinanceEntriesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FinancialEntryType, enumName: 'FinancialEntryType' })
  @IsOptional()
  @IsEnum(FinancialEntryType)
  type?: FinancialEntryType;

  @ApiPropertyOptional({ enum: FinancialEntryStatus, enumName: 'FinancialEntryStatus' })
  @IsOptional()
  @IsEnum(FinancialEntryStatus)
  status?: FinancialEntryStatus;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsString()
  to?: string;

  /**
   * Os dois recortes que o sino de avisos linka.
   *
   * Ficam no servidor porque a tela os aplicava no navegador, sobre a lista
   * inteira — e com a lista paginada isso passaria a filtrar só a página.
   */
  @ApiPropertyOptional({ enum: ['vencidas', 'a-vencer'] })
  @IsOptional()
  @IsIn(['vencidas', 'a-vencer'])
  recorte?: 'vencidas' | 'a-vencer';
}
