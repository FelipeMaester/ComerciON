import { Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';

/**
 * O aviso de "calma aí" em português, e não o nome de uma classe Java.
 *
 * O limitador padrão responde `ThrottlerException: Too Many Requests`, e esse
 * texto chega inteiro à tela: quem esbarrou no teto via essa frase no meio do
 * painel, sem saber se tinha quebrado o sistema, se ia perder a venda ou o que
 * fazer a respeito.
 *
 * Visto de verdade durante a conferência: a tela "Minha conta" exibiu
 * exatamente `ThrottlerException: Too Many Requests` como se fosse conteúdo.
 *
 * A mensagem diz as três coisas que a pessoa precisa: o que aconteceu, que não
 * é culpa dela, e que basta esperar.
 */
@Injectable()
export class ThrottlerEmPortuguesGuard extends ThrottlerGuard {
  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException('Muitas requisições em pouco tempo. Espere um instante e tente de novo.');
  }
}
