import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token recebido por e-mail (vai na URL do link)' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'nova-senha-forte', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'A nova senha precisa ter pelo menos 8 caracteres' })
  newPassword!: string;
}
