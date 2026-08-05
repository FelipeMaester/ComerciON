import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialEntryType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateFinancialEntryDto {
  @ApiProperty({ enum: FinancialEntryType, enumName: 'FinancialEntryType' })
  @IsEnum(FinancialEntryType)
  type!: FinancialEntryType;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty({ description: 'Data de vencimento (ISO 8601)' })
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({ description: 'Apenas para lançamentos do tipo RECEIVABLE' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Apenas para lançamentos do tipo PAYABLE' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;
}
