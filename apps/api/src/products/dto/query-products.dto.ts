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

  /**
   * Depósito para o qual calcular o saldo de cada produto.
   *
   * Estoque é por depósito, e é isso que o PDV precisa saber: quantas peças
   * existem NO depósito de onde a venda vai sair. O total somando todos os
   * depósitos enganaria — o vendedor veria "5 em estoque" e a venda seria
   * recusada porque as 5 estão em outro lugar.
   *
   * Sem este parâmetro, `totalQuantity` vem somando todos os depósitos, que é
   * o número certo para a tela de catálogo.
   */
  @ApiPropertyOptional({ description: 'Calcula o saldo apenas neste depósito' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}
