import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

// Cobre o formato antigo (ABC-1234) e o Mercosul (ABC1D23) — com ou sem
// hífen, maiúsculo ou minúsculo. A normalização (maiúsculas, sem hífen)
// acontece no service antes de salvar.
const PLATE_PATTERN = /^[A-Za-z]{3}-?\d([A-Za-z]\d{2}|\d{3})$/;

const MIN_YEAR = 1900;
const MAX_YEAR = new Date().getFullYear() + 1;

export class CreateCustomerVehicleDto {
  @ApiProperty({ example: 'ABC1D23', description: 'Placa no formato antigo (ABC-1234) ou Mercosul (ABC1D23)' })
  @IsString()
  @Matches(PLATE_PATTERN, { message: 'plate deve ser uma placa válida (ex.: ABC-1234 ou ABC1D23)' })
  plate!: string;

  @ApiPropertyOptional({ example: 'Fiat' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  brand?: string;

  @ApiPropertyOptional({ example: 'Uno' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  model?: string;

  @ApiPropertyOptional({ example: 'Branco' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  color?: string;

  @ApiPropertyOptional({ example: 2020 })
  @IsOptional()
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  year?: number;
}
