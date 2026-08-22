import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StockService } from './stock.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StockService', () => {
  let service: StockService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const product = { id: 'product-1', name: 'Radiador Gol G5' };
  const warehouse = { id: 'warehouse-1', name: 'Loja Principal' };

  /**
   * Banco de mentira, mas com a semântica que importa aqui: `updateMany`
   * respeita o filtro `quantity: { gte: n }` e devolve `count: 0` quando ele
   * não bate — exatamente como o Postgres faz. Sem isso, o teste da corrida
   * passaria mesmo com o bug de volta.
   */
  function bancoComSaldo(saldos: Record<string, number>) {
    return {
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      warehouse: { findUnique: jest.fn().mockResolvedValue(warehouse) },
      stockItem: {
        findMany: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn(async ({ where, select }: any) => {
          const id = where.id ?? `si-${where.warehouseId}`;
          if (saldos[id] === undefined) return null;
          return select?.quantity ? { quantity: saldos[id] } : { id, quantity: saldos[id] };
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const atual = saldos[where.id];
          if (atual === undefined) return { count: 0 };
          if (where.quantity?.gte !== undefined && atual < where.quantity.gte) return { count: 0 };
          if (data.quantity?.increment !== undefined) saldos[where.id] = atual + data.quantity.increment;
          else if (data.quantity?.decrement !== undefined) saldos[where.id] = atual - data.quantity.decrement;
          else saldos[where.id] = data.quantity;
          return { count: 1 };
        }),
      },
      stockMovement: {
        create: jest.fn((args: any) => args.data),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
  }

  function montar(saldos: Record<string, number>) {
    prisma = bancoComSaldo(saldos);
    service = new StockService(prisma as unknown as PrismaService);
    return saldos;
  }

  beforeEach(() => {
    montar({ 'si-warehouse-1': 0 });
  });

  describe('adjust', () => {
    it('soma quantidade em movimentação IN', async () => {
      const saldos = montar({ 'si-warehouse-1': 10 });

      const result = await service.adjust('user-1', {
        productId: 'product-1',
        warehouseId: 'warehouse-1',
        type: 'IN',
        quantity: 5,
      });

      expect(saldos['si-warehouse-1']).toBe(15);
      expect(result.newQuantity).toBe(15);
      expect(result.previousQuantity).toBe(10);
    });

    it('rejeita OUT maior que a quantidade disponível, sem alterar o estoque', async () => {
      const saldos = montar({ 'si-warehouse-1': 3 });

      await expect(
        service.adjust('user-1', {
          productId: 'product-1',
          warehouseId: 'warehouse-1',
          type: 'OUT',
          quantity: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(saldos['si-warehouse-1']).toBe(3);
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('a recusa diz qual peça, quanto tem e onde — quem lê está no balcão', async () => {
      // A mensagem antiga era "Quantidade insuficiente em estoque para esta
      // saída": jargão de estoque, sem dizer a peça nem o saldo. Com o
      // cliente esperando, o operador precisava abrir outra tela para
      // descobrir o que faltou — e com vários itens no carrinho, adivinhar
      // qual deles era.
      montar({ 'si-warehouse-1': 3 });

      let erro: Error | undefined;
      try {
        await service.adjust('user-1', {
          productId: 'product-1',
          warehouseId: 'warehouse-1',
          type: 'OUT',
          quantity: 10,
        });
      } catch (e) {
        erro = e as Error;
      }

      expect(erro).toBeInstanceOf(BadRequestException);
      // As quatro informações que decidem o que fazer agora.
      expect(erro?.message).toContain('Radiador Gol G5');
      expect(erro?.message).toContain('Loja Principal');
      expect(erro?.message).toContain('3');
      expect(erro?.message).toContain('10');
    });

    it('a baixa vai como decremento condicional, não como valor calculado no JavaScript', async () => {
      montar({ 'si-warehouse-1': 8 });

      await service.adjust('user-1', {
        productId: 'product-1',
        warehouseId: 'warehouse-1',
        type: 'OUT',
        quantity: 3,
      });

      // É este formato que impede a venda dupla: a condição viaja dentro do
      // UPDATE, e o novo saldo é derivado do antigo pelo banco.
      expect(prisma.stockItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'si-warehouse-1', quantity: { gte: 3 } },
        data: { quantity: { decrement: 3 } },
      });
    });

    it('ADJUSTMENT define a quantidade final como valor absoluto (não soma)', async () => {
      const saldos = montar({ 'si-warehouse-1': 50 });

      const result = await service.adjust('user-1', {
        productId: 'product-1',
        warehouseId: 'warehouse-1',
        type: 'ADJUSTMENT',
        quantity: 7,
      });

      expect(result.newQuantity).toBe(7);
      expect(saldos['si-warehouse-1']).toBe(7);
    });

    it('lança NotFoundException se o produto não existir', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.adjust('user-1', { productId: 'ghost', warehouseId: 'warehouse-1', type: 'IN', quantity: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('registra o saldo que o banco confirmou, não o que foi lido antes de gravar', async () => {
      const saldos = montar({ 'si-warehouse-1': 10 });
      // Simula outra transação tendo baixado 4 unidades entre a leitura
      // inicial e a gravação: o log tem de refletir o valor real.
      const findFirstOriginal = prisma.stockItem.findFirst;
      prisma.stockItem.findFirst = jest.fn(async (args: any) => {
        const r = await findFirstOriginal(args);
        if (!args.select) saldos['si-warehouse-1'] = 6;
        return r;
      });

      const result = await service.adjust('user-1', {
        productId: 'product-1',
        warehouseId: 'warehouse-1',
        type: 'OUT',
        quantity: 2,
      });

      expect(result.newQuantity).toBe(4);
      expect(result.previousQuantity).toBe(6);
    });
  });

  describe('transfer', () => {
    it('rejeita transferência para o mesmo depósito', async () => {
      await expect(
        service.transfer('user-1', {
          productId: 'product-1',
          sourceWarehouseId: 'warehouse-1',
          destWarehouseId: 'warehouse-1',
          quantity: 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('move quantidade do depósito de origem para o destino atomicamente', async () => {
      const saldos = montar({ 'si-warehouse-1': 20, 'si-warehouse-2': 5 });

      const result = await service.transfer('user-1', {
        productId: 'product-1',
        sourceWarehouseId: 'warehouse-1',
        destWarehouseId: 'warehouse-2',
        quantity: 8,
      });

      expect(result.sourceQuantity).toBe(12);
      expect(result.destQuantity).toBe(13);
      expect(saldos['si-warehouse-1']).toBe(12);
      expect(saldos['si-warehouse-2']).toBe(13);
      expect(prisma.stockMovement.create).toHaveBeenCalledTimes(2);
    });

    it('rejeita transferência com quantidade insuficiente na origem e não toca o destino', async () => {
      const saldos = montar({ 'si-warehouse-1': 2, 'si-warehouse-2': 5 });

      await expect(
        service.transfer('user-1', {
          productId: 'product-1',
          sourceWarehouseId: 'warehouse-1',
          destWarehouseId: 'warehouse-2',
          quantity: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(saldos['si-warehouse-1']).toBe(2);
      expect(saldos['si-warehouse-2']).toBe(5);
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });
  });
});
