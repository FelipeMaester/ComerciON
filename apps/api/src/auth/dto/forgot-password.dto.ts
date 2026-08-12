import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'maria@loja.com.br' })
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  email!: string;
}
