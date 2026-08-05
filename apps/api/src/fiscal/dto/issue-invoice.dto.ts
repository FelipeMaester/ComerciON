import { ApiProperty } from '@nestjs/swagger';
import { InvoiceType } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class IssueInvoiceDto {
  @ApiProperty({ enum: InvoiceType, enumName: 'InvoiceType', description: 'NFE = venda para empresa, NFCE = venda ao consumidor final' })
  @IsEnum(InvoiceType)
  type!: InvoiceType;
}
