import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class UpdateStockCountItemDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  countedQty!: number;
}
