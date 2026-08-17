import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class EnviarEmailDeTesteDto {
  @ApiProperty({ example: 'voce@suaempresa.com.br' })
  @IsEmail({}, { message: 'Informe um endereço de e-mail válido' })
  para!: string;
}
