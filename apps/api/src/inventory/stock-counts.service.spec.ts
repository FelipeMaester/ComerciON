import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StockCountsService, tempoParaAjustar } from './stock-counts.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from './stock.service';

/** O que o Prisma devolve em `fields.expectedQty` — aqui só precisa ser reconhecível. */
const REF_ESPERADA = { _ref: 'expectedQty' };

describe('tempoParaAjustar', () => {
  it('cobre a contagem pequena com o mínimo', () => {
    expect(tempoParaAjustar(0)).toBe(15_000);
    expect(tempoParaAjustar(10)).toBe(15_000);
  });

  it('cresce com o número de divergências', () => {
    // 4.000 peças divergentes é a loja que nunca contou e tinha tudo zerado.
    expect(tempoParaAjustar(1_000)).toBe(40_000);
    expect(tempoParaAjustar(4_000)).toBe(160_000);
  });

  it('tem teto, para consulta travada não segurar as peças indefinidamente', () => {
    expect(tempoParaAjustar(1_000_000)).toBe(300_000);
  });
});

describe('StockCountsService', () => {
  let service: StockCountsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stockService: any;

  beforeEach(() => {
    prisma = {
      warehouse: { findUnique: jest.fn() },
      product: { findMany: jest.fn() },
      stockCount: {
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(() => prisma.stockCount.findUnique()),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
        // Semântica do banco: fechar/cancelar só 'pega' com a contagem ABERTA.
        updateMany: jest.fn(async ({ where, data }: any) => {
          const atual = await prisma.stockCount.findUnique();
          if (!atual) return { count: 0 };
          if (where.status && atual.status !== where.status) return { count: 0 };
          Object.assign(atual, data);
          return { count: 1 };
        }),
      },
      stockCountItem: {
        createMany: jest.fn().mockResolvedValue({}),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'item-1', countedQty: 5 }),
        count: jest.fn().mockResolvedValue(0),
        fields: { expectedQty: REF_ESPERADA },
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
      stockMovement: { create: jest.fn() },
    };
    stockService = { performAdjust: jest.fn().mockResolvedValue(undefined) };
    service = new StockCountsService(prisma as unknown as PrismaService, stockService as unknown as StockService);
  });

  describe('create', () => {
    it('rejeita depósito inexistente', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);
      await expect(service.create('user-1', { warehouseId: 'warehouse-1' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita quando nenhum produto é encontrado para contar', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({ id: 'warehouse-1' });
      prisma.product.findMany.mockResolvedValue([]);
      await expect(service.create('user-1', { warehouseId: 'warehouse-1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tira uma foto (expectedQty) da quantidade atual de cada produto no depósito', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({ id: 'warehouse-1' });
      prisma.product.findMany.mockResolvedValue([
        { id: 'product-1', stockItems: [{ quantity: 10 }] },
        { id: 'product-2', stockItems: [] },
      ]);
      prisma.stockCount.create.mockResolvedValue({ id: 'count-1' });
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1' });

      await service.create('user-1', { warehouseId: 'warehouse-1' });

      expect(prisma.stockCountItem.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({ productId: 'product-1', expectedQty: 10 }),
            expect.objectContaining({ productId: 'product-2', expectedQty: 0 }),
          ],
        }),
      );
    });
  });

  describe('complete', () => {
    it('rejeita contagem que não está mais aberta', async () => {
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1', status: 'COMPLETED' });
      await expect(service.complete('count-1', 'user-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ajusta o estoque das peças que divergiram', async () => {
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1', status: 'OPEN', warehouseId: 'warehouse-1' });
      prisma.stockCountItem.findMany.mockResolvedValue([{ productId: 'product-2', countedQty: 3 }]);

      await service.complete('count-1', 'user-1');

      expect(stockService.performAdjust).toHaveBeenCalledTimes(1);
      expect(stockService.performAdjust).toHaveBeenCalledWith(
        prisma,
        'user-1',
        expect.objectContaining({ productId: 'product-2', type: 'ADJUSTMENT', quantity: 3 }),
      );
      expect(prisma.stockCount.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'count-1', status: 'OPEN' },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });

    /**
     * A peça que bateu e a que ninguém contou não podem virar ajuste — e agora
     * quem as descarta é o banco, não um `continue` depois de carregar tudo.
     * Sem esta asserção, um filtro trocado por `{}` traria a contagem inteira
     * e lançaria ajuste para peça que ninguém tocou.
     */
    /**
     * O prazo da transação acompanha o tamanho do serviço.
     *
     * Com os 5 segundos padrão do Prisma, uma contagem com mais de ~900
     * divergências não fechava nunca: a transação estourava, tudo voltava
     * atrás e a contagem seguia aberta — depois de horas de trabalho no
     * galpão, sem nada que a pessoa pudesse fazer a respeito.
     */
    it('dá à transação um prazo proporcional às divergências', async () => {
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1', status: 'OPEN', warehouseId: 'warehouse-1' });
      prisma.stockCountItem.findMany.mockResolvedValue(
        Array.from({ length: 1000 }, (_, i) => ({ productId: `product-${i}`, countedQty: 1 })),
      );

      await service.complete('count-1', 'user-1');

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 40_000 });
    });

    it('pede ao banco só os itens divergentes, não a contagem inteira', async () => {
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1', status: 'OPEN', warehouseId: 'warehouse-1' });

      await service.complete('count-1', 'user-1');

      expect(prisma.stockCountItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            stockCountId: 'count-1',
            countedQty: { not: null },
            NOT: { countedQty: { equals: REF_ESPERADA } },
          }),
        }),
      );
    });
  });

  describe('cancel', () => {
    it('rejeita contagem que não está mais aberta', async () => {
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1', status: 'CANCELED' });
      await expect(service.cancel('count-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cancela uma contagem aberta', async () => {
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1', status: 'OPEN' });

      await service.cancel('count-1');

      expect(prisma.stockCount.updateMany).toHaveBeenCalledWith({
        where: { id: 'count-1', status: 'OPEN' },
        data: { status: 'CANCELED' },
      });
    });
  });

  describe('setCountedQty', () => {
    it('rejeita item que não pertence à contagem', async () => {
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1', status: 'OPEN' });
      prisma.stockCountItem.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.setCountedQty('count-1', 'item-de-outra', 5)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('só altera o item se ele for desta contagem', async () => {
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1', status: 'OPEN' });

      await service.setCountedQty('count-1', 'item-1', 5);

      // O stockCountId no WHERE é o que impede alterar o item de outra
      // contagem passando o id dele na URL.
      expect(prisma.stockCountItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'item-1', stockCountId: 'count-1' },
        data: { countedQty: 5 },
      });
    });

    /**
     * O defeito que originou esta rodada.
     *
     * Salvar UMA peça devolvia a contagem inteira: 1,4 MB por tecla numa loja
     * de 4.000 peças, quase 6 GB para contar o inventário todo, com a tabela
     * de 4.000 linhas redesenhada a cada salvamento. Voltar o `return` para a
     * ficha completa faz este teste falhar.
     */
    it('devolve a peça salva e os totais — nunca a contagem inteira', async () => {
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1', status: 'OPEN' });
      prisma.stockCountItem.findUniqueOrThrow.mockResolvedValue({ id: 'item-1', countedQty: 5 });
      prisma.stockCountItem.count.mockResolvedValueOnce(4000).mockResolvedValueOnce(1).mockResolvedValueOnce(1);

      const resposta = await service.setCountedQty('count-1', 'item-1', 5);

      expect(resposta).toEqual({
        item: { id: 'item-1', countedQty: 5 },
        resumo: { total: 4000, contados: 1, pendentes: 3999, divergentes: 1 },
      });
      expect(resposta).not.toHaveProperty('items');
      expect(prisma.stockCountItem.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findItems', () => {
    beforeEach(() => {
      prisma.stockCount.findUnique.mockResolvedValue({ id: 'count-1', status: 'OPEN' });
    });

    it('devolve uma página, não a contagem toda', async () => {
      prisma.stockCountItem.findMany.mockResolvedValue([{ id: 'item-1' }]);
      prisma.stockCountItem.count.mockResolvedValue(4000);

      const pagina = await service.findItems('count-1', { page: 2, pageSize: 25 });

      expect(pagina).toEqual({ items: [{ id: 'item-1' }], total: 4000, page: 2, pageSize: 25, totalPages: 160 });
      expect(prisma.stockCountItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 25, take: 25 }));
    });

    it('"pendentes" traz só o que ainda não foi contado', async () => {
      await service.findItems('count-1', { situacao: 'PENDENTES' });
      expect(prisma.stockCountItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ countedQty: null }) }),
      );
    });

    it('"divergentes" compara as duas colunas no banco', async () => {
      await service.findItems('count-1', { situacao: 'DIVERGENTES' });
      expect(prisma.stockCountItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            countedQty: { not: null },
            NOT: { countedQty: { equals: REF_ESPERADA } },
          }),
        }),
      );
    });

    it('busca por nome, SKU e código de barras da peça', async () => {
      await service.findItems('count-1', { search: '  filtro  ' });
      expect(prisma.stockCountItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            product: {
              OR: [
                { name: { contains: 'filtro', mode: 'insensitive' } },
                { sku: { contains: 'filtro', mode: 'insensitive' } },
                { barcode: { contains: 'filtro', mode: 'insensitive' } },
              ],
            },
          }),
        }),
      );
    });

    /**
     * Ordem instável faz a página 2 repetir uma peça da página 1 e pular
     * outra — e quem está contando não tem como perceber que pulou.
     */
    it('ordena com desempate, para a paginação não pular peça', async () => {
      await service.findItems('count-1', {});
      expect(prisma.stockCountItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ product: { name: 'asc' } }, { id: 'asc' }] }),
      );
    });

    it('rejeita contagem inexistente', async () => {
      prisma.stockCount.findUnique.mockResolvedValue(null);
      await expect(service.findItems('nao-existe', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAll', () => {
    /**
     * A listagem trazia `items: {select:{id:true}}` de cada contagem só para
     * escrever "4.000 itens" na coluna: 184 KB com uma contagem aberta.
     */
    it('conta os itens no banco em vez de carregá-los', async () => {
      await service.findAll({});
      const argumentos = prisma.stockCount.findMany.mock.calls[0][0];
      expect(argumentos.include).toEqual(expect.objectContaining({ _count: { select: { items: true } } }));
      expect(argumentos.include).not.toHaveProperty('items');
    });

    it('pagina', async () => {
      prisma.stockCount.findMany.mockResolvedValue([{ id: 'count-1' }]);
      prisma.stockCount.count.mockResolvedValue(3);

      const pagina = await service.findAll({ page: 1, pageSize: 25 });

      expect(pagina).toEqual({ items: [{ id: 'count-1' }], total: 3, page: 1, pageSize: 25, totalPages: 1 });
    });
  });
});
