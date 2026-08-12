import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination.dto';

export class QueryCustomersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nome, telefone ou documento' })
  @IsOptional()
  @IsString()
  search?: string;
}
