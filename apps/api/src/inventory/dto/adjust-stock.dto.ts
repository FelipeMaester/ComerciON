import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

const ADJUSTABLE_TYPES = ['IN', 'OUT', 'ADJUSTMENT', 'LOSS'] as const;
export type AdjustableStockMovementType = (typeof ADJUSTABLE_TYPES)[number];

export class AdjustStockDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty()
  @IsUUID()
  warehouseId!: string;

  @ApiProperty({ enum: ADJUSTABLE_TYPES, description: 'Transferências usam o endpoint /inventory/stock/transfer' })
  @IsIn(ADJUSTABLE_TYPES)
  type!: AdjustableStockMovementType;

  @ApiProperty({ description: 'IN/OUT/LOSS: quantidade a somar/subtrair. ADJUSTMENT: quantidade final absoluta.' })
  @IsInt()
  @Min(0)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
