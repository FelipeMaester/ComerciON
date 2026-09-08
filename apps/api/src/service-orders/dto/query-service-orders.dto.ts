import { ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceOrderStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';

/**
 * As situações que a tela oferece.
 *
 * "ABERTAS" e "ATRASADAS" não são status do banco: são as duas perguntas que
 * a oficina faz de verdade — o que está na bancada, e o que passou do dia
 * marcado. Ficam ao lado dos status porque, para quem usa, são a mesma
 * escolha.
 */
export const SITUACOES_DA_ORDEM = [
  'ABERTAS',
  'ATRASADAS',
  ...Object.values(ServiceOrderStatus),
] as const;
export type SituacaoDaOrdem = (typeof SITUACOES_DA_ORDEM)[number];

export class QueryServiceOrdersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SITUACOES_DA_ORDEM, default: 'ABERTAS' })
  @IsOptional()
  @IsIn(SITUACOES_DA_ORDEM)
  situacao?: SituacaoDaOrdem;

  @ApiPropertyOptional({ description: 'Nome do cliente ou placa do veículo' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
