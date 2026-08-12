import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

function hostFor(method = 'GET', url = '/api/products') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method, url }),
      }),
    } as unknown as ArgumentsHost,
    status,
    json,
    body: () => json.mock.calls[0][0],
  };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    // O filtro loga de propósito; silenciar mantém a saída do teste legível.
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => {});
    jest.spyOn(filter['logger'], 'warn').mockImplementation(() => {});
  });

  it('preserva status e mensagem de uma HttpException', () => {
    const h = hostFor();
    filter.catch(new NotFoundException('Produto não encontrado'), h.host);

    expect(h.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(h.body()).toMatchObject({ statusCode: 404, message: 'Produto não encontrado' });
  });

  it('preserva a LISTA de erros do ValidationPipe', () => {
    // O frontend já sabe exibir campo a campo; achatar em string quebraria isso.
    const h = hostFor('POST', '/api/customers');
    filter.catch(new BadRequestException(['nome é obrigatório', 'e-mail inválido']), h.host);

    expect(h.body().message).toEqual(['nome é obrigatório', 'e-mail inválido']);
  });

  it('NÃO vaza a mensagem original de um erro inesperado', () => {
    // Mensagem de erro cru costuma citar tabela, coluna e até o SQL.
    const h = hostFor();
    filter.catch(new Error('relation "users" does not exist at character 15'), h.host);

    expect(h.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(h.body())).not.toContain('users');
    expect(h.body().message).toMatch(/Erro interno/);
  });

  it('devolve um id de erro que também vai para o log', () => {
    const h = hostFor();
    const spy = jest.spyOn(filter['logger'], 'error');
    filter.catch(new Error('boom'), h.host);

    const { errorId } = h.body();
    expect(errorId).toHaveLength(8);
    // Sem o mesmo id nos dois lados, o suporte não consegue achar a ocorrência.
    expect(spy.mock.calls[0][0]).toContain(errorId);
  });

  it('violação de unicidade do Prisma vira 409 dizendo qual campo', () => {
    const h = hostFor('POST', '/api/products');
    const error = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['sku'] },
    });

    filter.catch(error, h.host);

    expect(h.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(h.body().message).toContain('sku');
  });

  it('registro inexistente do Prisma vira 404, não 500', () => {
    const h = hostFor();
    filter.catch(
      new Prisma.PrismaClientKnownRequestError('nope', { code: 'P2025', clientVersion: '5.22.0' }),
      h.host,
    );
    expect(h.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('violação de chave estrangeira vira 400 com explicação útil', () => {
    const h = hostFor('DELETE', '/api/categories/1');
    filter.catch(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: '5.22.0' }),
      h.host,
    );

    expect(h.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(h.body().message).toMatch(/vinculado/);
  });

  it('4xx não gasta stack trace no log; 5xx gasta', () => {
    const errorSpy = jest.spyOn(filter['logger'], 'error');
    const warnSpy = jest.spyOn(filter['logger'], 'warn');

    filter.catch(new NotFoundException('x'), hostFor().host);
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    filter.catch(new Error('x'), hostFor().host);
    expect(errorSpy).toHaveBeenCalled();
  });
});
