import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerSegment, CustomerType, PriceTier } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsCpfCnpj } from '../../common/validators/is-cpf-cnpj.decorator';

export class CreateCustomerDto {
  @ApiProperty({ enum: CustomerType, enumName: 'CustomerType' })
  @IsEnum(CustomerType)
  type!: CustomerType;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ description: 'CPF ou CNPJ (com ou sem máscara)' })
  @IsOptional()
  @IsString()
  @IsCpfCnpj()
  document?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ enum: CustomerSegment, enumName: 'CustomerSegment' })
  @IsOptional()
  @IsEnum(CustomerSegment)
  segment?: CustomerSegment;

  @ApiPropertyOptional({ enum: PriceTier, enumName: 'PriceTier' })
  @IsOptional()
  @IsEnum(PriceTier)
  priceTier?: PriceTier;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
