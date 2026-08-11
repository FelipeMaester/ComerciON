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
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SaleItemDto } from './sale-item.dto';
import { SalePaymentDto } from './sale-payment.dto';

export class CreateSaleDto {
  @ApiPropertyOptional({ description: 'Omitido = venda avulsa (sem cliente cadastrado)' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty()
  @IsUUID()
  warehouseId!: string;

  @ApiPropertyOptional({ description: 'Endereço de entrega (loja virtual)' })
  @IsOptional()
  @IsUUID()
  shippingAddressId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiProperty({ type: [SaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

  @ApiPropertyOptional({ type: [SalePaymentDto], description: 'Obrigatório quando confirm=true' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments?: SalePaymentDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ description: 'Zerado no servidor se o cupom aplicado tiver frete grátis' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @ApiPropertyOptional({
    description:
      'Acréscimo de repasse da taxa da maquininha de cartão de crédito, calculado no cliente a partir de Tenant.cardFeeRates.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cardFeeAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: false, description: 'true = venda direta (baixa estoque + gera contas a receber); false = fica como orçamento' })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @ApiPropertyOptional({
    description:
      'Prazo em dias para o valor deixado como fiado (cliente parceiro). Se omitido, usa o prazo padrão do cadastro do cliente.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  fiadoDays?: number;
}
