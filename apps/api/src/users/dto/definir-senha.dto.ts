import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * As mesmas regras do cadastro (CreateUserDto). Uma senha definida pelo
 * administrador não pode ser mais fraca que uma escolhida pela própria pessoa
 * — seria justamente a conta com senha fraca a que alguém já quis mexer.
 */
export class DefinirSenhaDto {
  @ApiProperty({ minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'A senha precisa ter ao menos uma letra maiúscula, uma minúscula e um número',
  })
  novaSenha!: string;
}
