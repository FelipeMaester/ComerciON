import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { OrdenacaoQueryDto } from '../../common/pagination/pagination.dto';

export class QueryCustomersDto extends OrdenacaoQueryDto {
  @ApiPropertyOptional({ description: 'Busca por nome, telefone ou documento' })
  @IsOptional()
  @IsString()
  search?: string;
}
