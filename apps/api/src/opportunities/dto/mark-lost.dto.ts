import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class MarkLostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
