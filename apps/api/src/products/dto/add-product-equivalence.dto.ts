import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddProductEquivalenceDto {
  @ApiProperty()
  @IsUUID()
  equivalentId!: string;
}
