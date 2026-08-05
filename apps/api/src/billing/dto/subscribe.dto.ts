import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SubscribeDto {
  @ApiProperty({ example: 'pro' })
  @IsString()
  @IsNotEmpty()
  planKey!: string;
}
