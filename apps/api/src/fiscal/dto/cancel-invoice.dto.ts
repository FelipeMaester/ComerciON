import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CancelInvoiceDto {
  @ApiProperty()
  @IsString()
  @MinLength(15, { message: 'Justificativa de cancelamento deve ter ao menos 15 caracteres' })
  reason!: string;
}
