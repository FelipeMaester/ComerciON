import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterTenantDto {
  @ApiProperty({ example: 'Auto Peças Silva' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  tenantName!: string;

  @ApiProperty({ example: 'autopecas-silva', description: 'Identificador único da empresa (usado no header x-tenant-slug e, futuramente, no subdomínio)' })
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'tenantSlug deve conter apenas letras minúsculas, números e hífens',
  })
  tenantSlug!: string;

  @ApiProperty({ required: false, example: '12345678000199' })
  @IsOptional()
  @IsString()
  tenantDocument?: string;

  @ApiProperty({ example: 'Felipe Maester' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  adminName!: string;

  @ApiProperty({ example: 'felipe@autopecas-silva.com.br' })
  @IsEmail()
  adminEmail!: string;

  @ApiProperty({ example: 'SenhaForte123' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'adminPassword deve conter ao menos uma letra maiúscula, uma minúscula e um número',
  })
  adminPassword!: string;

  @ApiProperty({ required: false, example: 'trial', description: 'Chave do plano inicial — padrão "trial" quando não informado' })
  @IsOptional()
  @IsString()
  planKey?: string;
}
