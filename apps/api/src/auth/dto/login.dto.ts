import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;

  @ApiProperty({ required: false, description: 'Obrigatório se o usuário tiver 2FA habilitado' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  twoFactorCode?: string;
}
