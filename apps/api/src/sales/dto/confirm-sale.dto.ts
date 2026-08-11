import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { SalePaymentDto } from './sale-payment.dto';

export class ConfirmSaleDto {
  @ApiPropertyOptional({
    type: [SalePaymentDto],
    description:
      'Pagamentos informados na hora da confirmação (além dos que já estavam anexados ao orçamento). Para cliente parceiro, o que faltar vira fiado.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments?: SalePaymentDto[];

  @ApiPropertyOptional({
    description:
      'Prazo em dias para o valor deixado como fiado. Se omitido, usa o prazo padrão do cadastro do cliente.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  fiadoDays?: number;

  @ApiPropertyOptional({
    description:
      'Acréscimo de repasse da taxa da maquininha de cartão de crédito, somado ao total da venda no momento da confirmação.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cardFeeAmount?: number;
}
