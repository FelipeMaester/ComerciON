import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class SaleItemDto {
  @ApiPropertyOptional({ description: 'Deixe vazio para um item avulso (ex.: mão de obra) — informe description e unitPrice nesse caso' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Obrigatório quando productId não é informado' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Se omitido, usa o preço cadastrado do produto (obrigatório quando não há productId)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;
}
