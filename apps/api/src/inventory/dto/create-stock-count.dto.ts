import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateStockCountDto {
  @ApiProperty()
  @IsUUID()
  warehouseId!: string;

  @ApiPropertyOptional({ description: 'Se omitido, conta todos os produtos ativos do depósito' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  productIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
