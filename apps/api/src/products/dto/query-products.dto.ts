import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';

/**
 * Filtros da listagem de produtos.
 *
 * Estende PaginationQueryDto em vez de somar um `@Query('search')` solto: o
 * ValidationPipe roda com `forbidNonWhitelisted`, então TODO parâmetro precisa
 * estar declarado em algum DTO — um parâmetro não declarado vira 400, não vira
 * "ignorado". Foi exatamente o que aconteceu na primeira versão desta
 * paginação, e derrubaria a busca do PDV inteira.
 */
export class QueryProductsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nome, SKU ou código de barras' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
