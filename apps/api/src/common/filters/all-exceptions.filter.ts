import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

/**
 * Último recurso para qualquer erro que chegue até aqui.
 *
 * Resolve dois problemas que andavam juntos:
 *
 * 1. Sem filtro, um erro inesperado virava um 500 genérico e sumia. Descobrir
 *    o que houve dependia do cliente ligar para contar.
 * 2. Um erro não tratado no Nest vaza a mensagem original na resposta, e
 *    mensagem de erro de banco costuma citar nomes de tabela e coluna.
 *
 * Cada erro ganha um id curto que vai NA RESPOSTA e NO LOG. Quem atende diz
 * "me passa o código do erro" e acha a ocorrência exata, sem precisar de
 * horário aproximado nem adivinhação.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message } = this.translate(exception);
    const errorId = randomUUID().slice(0, 8);
    const where = `${request.method} ${request.url}`;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Só o 5xx leva stack trace: 4xx é o sistema funcionando (validação
      // recusada, não encontrado), e encher o log deles esconde o que importa.
      this.logger.error(
        `[${errorId}] ${where} → ${status}: ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`[${errorId}] ${where} → ${status}: ${message}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      errorId,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private translate(exception: unknown): { status: number; message: string | string[] } {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      // O ValidationPipe devolve { message: string[] } — preservar o array
      // mantém a lista de campos inválidos que o frontend já sabe exibir.
      const message =
        typeof body === 'object' && body !== null && 'message' in body
          ? ((body as { message: string | string[] }).message)
          : exception.message;
      return { status: exception.getStatus(), message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.translatePrisma(exception);
    }

    // Erro desconhecido: a mensagem real fica só no log. Devolvê-la seria
    // entregar detalhe interno para quem estiver sondando a API.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno. Se o problema continuar, informe o código deste erro ao suporte.',
    };
  }

  /** Traduz os erros do Prisma que viram resposta de cliente, não 500. */
  private translatePrisma(error: Prisma.PrismaClientKnownRequestError): { status: number; message: string } {
    switch (error.code) {
      case 'P2002': {
        const fields = (error.meta?.target as string[] | undefined)?.join(', ');
        return {
          status: HttpStatus.CONFLICT,
          message: fields ? `Já existe um registro com este valor em: ${fields}` : 'Este registro já existe',
        };
      }
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, message: 'Registro não encontrado' };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Não é possível concluir: existe outro registro vinculado a este',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Erro ao acessar os dados. Se o problema continuar, informe o código deste erro ao suporte.',
        };
    }
  }
}
