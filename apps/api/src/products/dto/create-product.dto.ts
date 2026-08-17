import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Min, MinLength } from 'class-validator';

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'Ex: "Gol G5/G6 1.0/1.6 2008-2014"' })
  @IsOptional()
  @IsString()
  vehicleApplication?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ default: 'UN' })
  @IsOptional()
  @IsString()
  unit?: string;

  // --------------------------------------------------------------------------
  // Dados fiscais. Existiam no banco desde a Fase 4 e o serviço de nota fiscal
  // sempre os exigiu — mas nenhuma rota os aceitava, o que tornava a emissão de
  // NF-e/NFC-e impossível: o produto nascia sem NCM e o fiscal recusava com
  // "Complete os dados fiscais antes de emitir". Nada em toda a base gravava
  // estes campos; os testes do módulo fiscal passavam porque mocavam o produto
  // já preenchido.
  // --------------------------------------------------------------------------

  @ApiPropertyOptional({
    description: 'NCM do produto (8 dígitos) — obrigatório para emitir nota fiscal',
    example: '87089990',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/, { message: 'ncm deve ter 8 dígitos' })
  ncm?: string;

  @ApiPropertyOptional({ description: 'CFOP da operação; na falta, o padrão de venda no estado', example: '5102' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'cfop deve ter 4 dígitos' })
  cfop?: string;

  @ApiPropertyOptional({ description: 'CST/CSOSN do ICMS; na falta, 102 (Simples Nacional)', example: '102' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2,3}$/, { message: 'icmsCst deve ter 2 ou 3 dígitos' })
  icmsCst?: string;

  @ApiPropertyOptional({ description: 'Origem da mercadoria (0 a 8); 0 = nacional', example: '0' })
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
}
