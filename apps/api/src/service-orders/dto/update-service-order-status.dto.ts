import { ApiProperty } from '@nestjs/swagger';
import { ServiceOrderStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateServiceOrderStatusDto {
  @ApiProperty({ enum: ServiceOrderStatus, enumName: 'ServiceOrderStatus' })
  @IsEnum(ServiceOrderStatus)
  status!: ServiceOrderStatus;
}
