import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Min, MinLength } from 'class-validator';

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehicleApplication?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  // Dados fiscais — ver o comentário em create-product.dto.ts. Editáveis aqui
  // porque o caso comum é o produto já existir e a loja precisar completar o
  // NCM antes de emitir a primeira nota.

  @ApiPropertyOptional({ description: 'NCM do produto (8 dígitos)', example: '87089990' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/, { message: 'ncm deve ter 8 dígitos' })
  ncm?: string;

  @ApiPropertyOptional({ example: '5102' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'cfop deve ter 4 dígitos' })
  cfop?: string;

  @ApiPropertyOptional({ example: '102' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2,3}$/, { message: 'icmsCst deve ter 2 ou 3 dígitos' })
  icmsCst?: string;

  @ApiPropertyOptional({ description: 'Origem da mercadoria (0 a 8)', example: '0' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-8]$/, { message: 'icmsOrigem deve ser um dígito de 0 a 8' })
  icmsOrigem?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
