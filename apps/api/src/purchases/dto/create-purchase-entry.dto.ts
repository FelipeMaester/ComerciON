import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PurchaseEntryItemDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  /** Quanto a peça custou NESTA entrada — é o que atualiza o cadastro. */
  @ApiProperty({ minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost!: number;
}

export class CreatePurchaseEntryDto {
  @ApiProperty()
  @IsUUID()
  warehouseId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Número da nota, como está no papel' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  invoiceNumber?: string;

  /** Quando a mercadoria chegou — pode não ser hoje. */
  @ApiPropertyOptional({ example: '2026-09-06' })
  @IsOptional()
  @IsString()
  receivedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [PurchaseEntryItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseEntryItemDto)
  items!: PurchaseEntryItemDto[];

  /**
   * Confirma na hora: dá entrada no estoque e atualiza o custo.
   *
   * O caminho normal do balcão é este — quem está com a nota na mão digita e
   * confirma. O rascunho existe para nota grande, digitada aos poucos.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  /**
   * Gera a conta a pagar no Financeiro junto com a confirmação.
   *
   * Opcional porque nem toda entrada vira dívida: mercadoria paga à vista na
   * hora, ou já quitada por adiantamento, não deve virar pendência.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  gerarContaAPagar?: boolean;

  /** Vencimento da conta a pagar, quando ela é pedida. */
  @ApiPropertyOptional({ example: '2026-10-06' })
  @IsOptional()
  @IsString()
  dueDate?: string;
}
