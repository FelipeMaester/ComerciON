import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateQuoteItemDto {
  @ApiPropertyOptional({ description: 'Se for uma peça do estoque; deixe vazio para um item de mão de obra/serviço' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ example: 'Troca de óleo e filtro' })
  @IsString()
  @MinLength(1)
  description!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}
