import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
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

  /**
   * Deixa de fora as peças desativadas.
   *
   * Existe porque as duas telas que usam esta rota querem coisas opostas: o
   * PDV não pode oferecer no balcão uma peça que a loja tirou de linha, e a
   * lista de Produtos precisa continuar mostrando as inativas — é lá que se
   * reativa uma delas. Filtrar sempre esconderia a peça de quem quer trazê-la
   * de volta; não filtrar nunca a coloca no carrinho.
   *
   * Chega como texto na query ("true"), então a conversão é explícita: sem
   * ela, a string "false" seria verdadeira e o filtro valeria sempre.
   */
  @ApiPropertyOptional({ description: 'Só peças ativas (usado pela busca do PDV)' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyActive?: boolean;
}
