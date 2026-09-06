import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ConfirmPurchaseEntryDto {
  /**
   * Gera a conta a pagar no Financeiro junto com a confirmação.
   *
   * Opcional porque nem toda entrada vira dívida: mercadoria paga à vista na
   * hora, ou já quitada por adiantamento, não deve virar pendência.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  gerarContaAPagar?: boolean;

  @ApiPropertyOptional({ example: '2026-10-06' })
  @IsOptional()
  @IsString()
  dueDate?: string;
}
