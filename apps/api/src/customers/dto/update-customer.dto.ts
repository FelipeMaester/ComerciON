import { ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerSegment } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IsCpfCnpj } from '../../common/validators/is-cpf-cnpj.decorator';

export class UpdateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Cliente parceiro/fiado: prazo em dias para vencimento das contas de serviços. Envie null para remover.',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  paymentTermDays?: number | null;
}
