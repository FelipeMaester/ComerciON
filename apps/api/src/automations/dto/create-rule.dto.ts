import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutomationAction, AutomationTrigger } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateAutomationRuleDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ enum: AutomationTrigger })
  @IsEnum(AutomationTrigger)
  trigger!: AutomationTrigger;

  @ApiPropertyOptional({ description: 'Ex.: { days: 3 } para gatilhos baseados em tempo' })
  @IsOptional()
  @IsObject()
  triggerConfig?: Record<string, unknown>;

  @ApiProperty({ enum: AutomationAction })
  @IsEnum(AutomationAction)
  action!: AutomationAction;

  @ApiProperty({ description: 'Ex.: { messageTemplate } para SEND_WHATSAPP ou { titleTemplate, assignToId } para CREATE_TASK' })
  @IsObject()
  actionConfig!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Dias até a regra poder disparar de novo no mesmo registro. Omitido = dispara uma única vez, para sempre.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  cooldownDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
