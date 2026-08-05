import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class SetGoalDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  targetAmount!: number;
}
