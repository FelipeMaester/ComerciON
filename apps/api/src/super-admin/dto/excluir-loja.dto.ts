import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Confirmação para excluir uma loja.
 *
 * O identificador vai no corpo, repetido à mão, porque a exclusão não tem
 * desfazer. Id vem de lista, de link, de copiar e colar — e um id errado é
 * indistinguível de um certo. Digitar "autopecas-silva" é uma decisão.
 */
export class ExcluirLojaDto {
  @ApiProperty({
    description: 'O identificador da loja, repetido exatamente. Confirma que é esta loja mesmo.',
    example: 'autopecas-silva',
  })
  @IsString()
  @IsNotEmpty()
  slug!: string;
}
