import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class ScheduleServiceOrderDto {
  @ApiPropertyOptional({ description: 'Deixe vazio para remover o agendamento' })
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}
