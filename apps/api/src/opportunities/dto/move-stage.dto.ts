import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MoveStageDto {
  @ApiProperty()
  @IsUUID()
  stageId!: string;
}
