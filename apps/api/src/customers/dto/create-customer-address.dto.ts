import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AddressType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateCustomerAddressDto {
  @ApiProperty({ enum: AddressType, enumName: 'AddressType' })
  @IsEnum(AddressType)
  type!: AddressType;

  @ApiProperty()
  @IsString()
  street!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  complement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiProperty()
  @IsString()
  city!: string;

  @ApiProperty({ description: 'UF, 2 letras' })
  @IsString()
  @Length(2, 2)
  state!: string;

  @ApiProperty({ description: 'CEP, com ou sem hífen' })
  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'zipCode deve ser um CEP válido (00000-000)' })
  zipCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
