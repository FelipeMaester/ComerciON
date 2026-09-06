import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../inventory/stock.service';
import { PurchasesService } from './purchases.service';

/**
 * Entrada de mercadoria.
 *
 * Antes disto, dar entrada era uma peça por vez pela tela do produto. Uma nota
 * com 40 itens eram 40 operações manuais, e não sobrava registro de o que foi
 * comprado, de quem, por quanto, nem quando.
 */
describe('PurchasesService', () => {
  const deposito = { id: 'dep-1', name: 'Loja Principal' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let stockService: { performAdjust: jest.Mock };
  let service: PurchasesService;

  const dto = {
    warehouseId: 'dep-1',
    items: [
      { productId: 'peca-1', quantity: 10, unitCost: 180 },
      { productId: 'peca-2', quantity: 4, unitCost: 62.5 },
    ],
  };

  beforeEach(() => {
    stockService = { performAdjust: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      warehouse: { findUnique: jest.fn().mockResolvedValue(deposito) },
      supplier: { findUnique: jest.fn().mockResolvedValue({ id: 'forn-1' }) },
      product: {
        findMany: jest.fn().mockResolvedValue([{ id: 'peca-1' }, { id: 'peca-2' }]),
        update: jest.fn().mockResolvedValue({}),
      },
      purchaseEntry: {
        create: jest.fn().mockResolvedValue({ id: 'ent-1' }),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'ent-1' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      purchaseEntryItem: { createMany: jest.fn().mockResolvedValue({}) },
      financialEntry: { create: jest.fn().mockResolvedValue({ id: 'fin-1' }) },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    service = new PurchasesService(prisma as unknown as PrismaService, stockService as unknown as StockService);
  });

  describe('create', () => {
    it('soma o total da nota a partir dos itens', async () => {
      await service.create('user-1', dto as never);

      // 10 × 180 + 4 × 62,50 = 2.050
      expect(prisma.purchaseEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 2050 }) }),
      );
    });

    it('rascunho NÃO mexe em estoque nem em custo', async () => {
      // Nota grande se digita aos poucos. Se o estoque subisse a cada linha, o
      // saldo ficaria errado durante toda a digitação — e quem vendesse no
      // meio venderia sobre número que não existe.
      await service.create('user-1', dto as never);

      expect(stockService.performAdjust).not.toHaveBeenCalled();
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('confirmando, o estoque sobe e o custo do cadastro é atualizado', async () => {
      await service.create('user-1', { ...dto, confirm: true } as never);

      expect(stockService.performAdjust).toHaveBeenCalledTimes(2);
      expect(stockService.performAdjust).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        expect.objectContaining({ productId: 'peca-1', warehouseId: 'dep-1', type: 'IN', quantity: 10 }),
      );

      // O custo do cadastro passa a ser o desta compra. É o número que a
      // próxima venda vai congelar no item (SaleItem.unitCost).
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'peca-1' },
        data: { costPrice: 180 },
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'peca-2' },
        data: { costPrice: 62.5 },
      });
    });

    it('estoque e custo acontecem na MESMA transação', async () => {
      // Estoque que entra sem o custo subir deixa a margem errada em toda
      // venda seguinte, e não há como perceber: os dois números continuam
      // plausíveis. Por isso os dois efeitos precisam ser atômicos.
      await service.create('user-1', { ...dto, confirm: true } as never);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('gera a conta a pagar quando pedida, com o total da nota', async () => {
      await service.create('user-1', {
        ...dto,
        supplierId: 'forn-1',
        invoiceNumber: '12345',
        confirm: true,
        gerarContaAPagar: true,
        dueDate: '2026-10-06',
      } as never);

      expect(prisma.financialEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'PAYABLE',
            amount: 2050,
            category: 'Fornecedores',
            supplierId: 'forn-1',
          }),
        }),
      );
    });

    it('sem pedir, nenhuma conta a pagar nasce', async () => {
      // Controle: nem toda entrada vira dívida. Mercadoria paga à vista na
      // hora não pode virar pendência no Financeiro.
      await service.create('user-1', { ...dto, confirm: true } as never);

      expect(prisma.financialEntry.create).not.toHaveBeenCalled();
    });

    it('recusa conta a pagar em rascunho', async () => {
      // Dívida sem mercadoria conferida é dívida que a loja não sabe se deve.
      await expect(
        service.create('user-1', { ...dto, gerarContaAPagar: true } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa a nota inteira quando uma peça não existe', async () => {
      // Metade da nota entrando é pior que nenhuma: o estoque fica com um
      // número que não corresponde à prateleira nem ao papel.
      prisma.product.findMany.mockResolvedValue([{ id: 'peca-1' }]);

      await expect(service.create('user-1', dto as never)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.purchaseEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    beforeEach(() => {
      prisma.purchaseEntry.findUnique.mockResolvedValue({
        id: 'ent-1',
        status: 'DRAFT',
        warehouseId: 'dep-1',
        supplierId: null,
        invoiceNumber: null,
        total: 2050,
        items: [
          { productId: 'peca-1', quantity: 10, unitCost: 180, total: 1800 },
          { productId: 'peca-2', quantity: 4, unitCost: 62.5, total: 250 },
        ],
      });
    });

    it('confirma o rascunho e aplica os dois efeitos', async () => {
      await service.confirm('user-1', 'ent-1');

      expect(stockService.performAdjust).toHaveBeenCalledTimes(2);
      expect(prisma.product.update).toHaveBeenCalledTimes(2);
    });

    it('a trava do status vai no próprio UPDATE, e não em memória', async () => {
      // Sem o status na condição do UPDATE, dois cliques simultâneos passariam
      // os dois por uma conferência feita em memória e o estoque entraria duas
      // vezes. A sabotagem que trocou a condição por "DRAFT ou CONFIRMED"
      // passava em todos os outros testes deste arquivo.
      await service.confirm('user-1', 'ent-1');

      expect(prisma.purchaseEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ent-1', status: 'DRAFT' },
          data: expect.objectContaining({ status: 'CONFIRMED' }),
        }),
      );
    });

    it('dois cliques em confirmar não fazem o estoque entrar duas vezes', async () => {
      // A trava vai no próprio UPDATE, com o status na condição. Uma
      // conferência feita em memória deixaria os dois cliques passarem.
      prisma.purchaseEntry.updateMany.mockResolvedValue({ count: 0 });
      prisma.purchaseEntry.findUnique.mockResolvedValue({ id: 'ent-1', status: 'CONFIRMED', items: [] });

      await expect(service.confirm('user-1', 'ent-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(stockService.performAdjust).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('entrada confirmada não se cancela', async () => {
      // As peças já estão na prateleira e podem já ter sido vendidas. Desfazer
      // significaria tirar do estoque o que talvez não esteja mais lá.
      prisma.purchaseEntry.updateMany.mockResolvedValue({ count: 0 });
      prisma.purchaseEntry.findUnique.mockResolvedValue({ id: 'ent-1', status: 'CONFIRMED' });

      await expect(service.cancel('ent-1')).rejects.toThrow(/já entraram no estoque/);
    });

    it('rascunho se cancela sem tocar em nada', async () => {
      prisma.purchaseEntry.updateMany.mockResolvedValue({ count: 1 });
      prisma.purchaseEntry.findUnique.mockResolvedValue({ id: 'ent-1', status: 'CANCELED' });

      await service.cancel('ent-1');

      expect(stockService.performAdjust).not.toHaveBeenCalled();
    });
  });
});
