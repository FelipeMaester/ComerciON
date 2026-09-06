import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';

/**
 * As três situações que interessam a quem está contando.
 *
 * "Pendentes" é a que faz o trabalho andar: numa contagem de 4.000 peças, o
 * que a pessoa precisa ver é o que ainda falta, não a lista inteira de novo a
 * cada peça digitada.
 */
export const SITUACOES_DO_ITEM = ['TODOS', 'PENDENTES', 'DIVERGENTES'] as const;
export type SituacaoDoItem = (typeof SITUACOES_DO_ITEM)[number];

/**
 * Filtros dos itens de uma contagem.
 *
 * DTO próprio, e não o PaginationQueryDto puro, porque o ValidationPipe roda
 * com forbidNonWhitelisted: parâmetro que não está declarado em nenhum DTO da
 * rota não é ignorado, responde 400. Foi assim que a tela do financeiro
 * quebrou quando ganhou paginação sem ganhar o DTO junto.
 */
export class QueryStockCountItemsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Nome, SKU ou código de barras da peça' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: SITUACOES_DO_ITEM, default: 'TODOS' })
  @IsOptional()
  @IsIn(SITUACOES_DO_ITEM)
  situacao?: SituacaoDoItem;
}
