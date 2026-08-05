import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AddCorrectionDto {
  @ApiProperty()
  @IsString()
  @MinLength(15, { message: 'Carta de correção deve ter ao menos 15 caracteres' })
  text!: string;
}
