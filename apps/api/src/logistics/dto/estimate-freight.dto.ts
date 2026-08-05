import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsString, Length, ValidateNested } from 'class-validator';
import { FreightItemDto } from './freight-item.dto';

export class EstimateFreightDto {
  @ApiProperty({ type: [FreightItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FreightItemDto)
  items!: FreightItemDto[];

  @ApiProperty({ description: 'UF de destino, 2 letras' })
  @IsString()
  @Length(2, 2)
  destinationState!: string;
}
