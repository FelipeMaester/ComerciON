import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CashMovementType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class OpenCashSessionDto {
  @ApiProperty({ description: 'Troco deixado na gaveta na abertura' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingAmount!: number;
}

export class CashMovementDto {
  @ApiProperty({ enum: CashMovementType, description: 'WITHDRAWAL = sangria, DEPOSIT = suprimento' })
  @IsEnum(CashMovementType)
  type!: CashMovementType;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  // Obrigatório: uma sangria sem motivo declarado é exatamente o lançamento
  // que ninguém consegue explicar na conferência do fim do mês.
  @ApiProperty({ description: 'Motivo (ex.: "levado ao cofre", "troco do turno da tarde")' })
  @IsString()
  @MinLength(3)
  reason!: string;
}

export class CloseCashSessionDto {
  @ApiProperty({ description: 'Valor efetivamente contado na gaveta' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedAmount!: number;

  @ApiPropertyOptional({ description: 'Observação, principalmente quando houve diferença' })
  @IsOptional()
  @IsString()
  closingNotes?: string;
}
