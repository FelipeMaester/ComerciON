import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PaginationQueryDto, paginated, toSkipTake } from './pagination.dto';
import { QueryProductsDto } from '../../products/dto/query-products.dto';
import { QueryCustomersDto } from '../../customers/dto/query-customers.dto';
import { QuerySalesDto } from '../../sales/dto/query-sales.dto';

describe('paginação', () => {
  describe('toSkipTake', () => {
    it('usa página 1 e o tamanho padrão quando nada é pedido', () => {
      expect(toSkipTake({})).toEqual({ skip: 0, take: DEFAULT_PAGE_SIZE, page: 1, pageSize: DEFAULT_PAGE_SIZE });
    });

    it('converte página em deslocamento', () => {
      expect(toSkipTake({ page: 3, pageSize: 10 })).toMatchObject({ skip: 20, take: 10 });
    });

    it('nunca deixa o take passar do teto, mesmo se escapar da validação', () => {
      // Cinto e suspensório: o DTO já rejeita, mas se algum caminho interno
      // montar a query na mão, o teto continua valendo.
      expect(toSkipTake({ pageSize: 100000 }).take).toBe(MAX_PAGE_SIZE);
    });

    it('trata página zero ou negativa como a primeira', () => {
      expect(toSkipTake({ page: 0 }).skip).toBe(0);
      expect(toSkipTake({ page: -5 }).skip).toBe(0);
    });
  });

  describe('paginated', () => {
    it('calcula o total de páginas arredondando para cima', () => {
      expect(paginated([], 21, 1, 10).totalPages).toBe(3);
    });

    it('devolve 1 página quando não há nenhum item — nunca 0', () => {
      // "página 1 de 0" na tela não significa nada.
      expect(paginated([], 0, 1, 25).totalPages).toBe(1);
    });
  });

  describe('validação dos parâmetros', () => {
    const validar = <T extends object>(cls: new () => T, params: Record<string, unknown>) =>
      validateSync(plainToInstance(cls, params, { enableImplicitConversion: true }), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

    it('recusa pageSize acima do teto em vez de cortar em silêncio', () => {
      const erros = validar(PaginationQueryDto, { pageSize: 99999 });
      expect(erros).toHaveLength(1);
      expect(erros[0].property).toBe('pageSize');
    });

    /**
     * Este bloco existe por causa de um bug real: os filtros ficaram de fora do
     * DTO de paginação e, como o ValidationPipe roda com forbidNonWhitelisted,
     * `?search=...` passou a responder 400 — o que teria derrubado a busca de
     * produtos do PDV inteira. Todo filtro precisa estar declarado no DTO da
     * própria rota.
     */
    describe('todo filtro de cada rota está declarado (senão vira 400)', () => {
      it('produtos aceita search e categoryId', () => {
        expect(
          validar(QueryProductsDto, { page: 1, search: 'radiador', categoryId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
        ).toHaveLength(0);
      });

      it('clientes aceita search', () => {
        expect(validar(QueryCustomersDto, { page: 2, search: 'joão' })).toHaveLength(0);
      });

      it('vendas aceita status e customerId', () => {
        expect(
          validar(QuerySalesDto, { status: 'CONFIRMED', customerId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
        ).toHaveLength(0);
      });

      it('um parâmetro que ninguém declarou continua sendo recusado', () => {
        // A trava tem que continuar valendo: é ela que impede filtro digitado
        // errado passar despercebido devolvendo a lista inteira.
        expect(validar(QueryProductsDto, { parametroInventado: 'x' }).length).toBeGreaterThan(0);
      });
    });
  });
});
