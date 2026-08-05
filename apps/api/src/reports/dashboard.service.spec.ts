import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(() => {
    prisma = {
      sale: { aggregate: jest.fn() },
      saleItem: { groupBy: jest.fn() },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      salesGoal: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
    };
    service = new DashboardService(prisma as unknown as PrismaService);
  });

  describe('periodStats', () => {
    it('calcula total, contagem e ticket médio a partir do agregado', async () => {
      prisma.sale.aggregate.mockResolvedValue({ _sum: { total: 300 }, _count: 3 });
      const result = await service.periodStats(new Date('2026-08-01'), new Date('2026-09-01'));
      expect(result).toEqual({ from: new Date('2026-08-01'), to: new Date('2026-09-01'), total: 300, count: 3, averageTicket: 100 });
    });

    it('não divide por zero quando não há vendas no período', async () => {
      prisma.sale.aggregate.mockResolvedValue({ _sum: { total: null }, _count: 0 });
      const result = await service.periodStats(new Date('2026-08-01'), new Date('2026-09-01'));
      expect(result.total).toBe(0);
      expect(result.averageTicket).toBe(0);
    });
  });

  describe('getTopProducts', () => {
    it('devolve lista vazia quando não há vendas no período', async () => {
      prisma.saleItem.groupBy.mockResolvedValue([]);
      const result = await service.getTopProducts(new Date(), new Date(), 5);
      expect(result).toEqual([]);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('junta a quantidade/faturamento agrupado com os dados do produto', async () => {
      prisma.saleItem.groupBy.mockResolvedValue([
        { productId: 'p1', _sum: { quantity: 10, total: 1000 } },
        { productId: 'p2', _sum: { quantity: 5, total: 500 } },
      ]);
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'Radiador Gol', sku: 'RAD-GOL-001' },
        { id: 'p2', name: 'Defletor Gol', sku: 'DEF-GOL-001' },
      ]);

      const result = await service.getTopProducts(new Date(), new Date(), 5);

      expect(result).toEqual([
        { productId: 'p1', name: 'Radiador Gol', sku: 'RAD-GOL-001', quantity: 10, total: 1000 },
        { productId: 'p2', name: 'Defletor Gol', sku: 'DEF-GOL-001', quantity: 5, total: 500 },
      ]);
    });
  });

  describe('getAbcCurve', () => {
    it('classifica os produtos em A/B/C pelo faturamento acumulado (80/95%)', async () => {
      // p1=600 (60%), p2=300 (90% acumulado), p3=100 (100% acumulado) de um total de 1000
      prisma.saleItem.groupBy.mockResolvedValue([
        { productId: 'p1', _sum: { total: 600 } },
        { productId: 'p2', _sum: { total: 300 } },
        { productId: 'p3', _sum: { total: 100 } },
      ]);
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'A', sku: 'A' },
        { id: 'p2', name: 'B', sku: 'B' },
        { id: 'p3', name: 'C', sku: 'C' },
      ]);

      const result = await service.getAbcCurve();

      expect(result.find((r) => r.productId === 'p1')?.class).toBe('A');
      expect(result.find((r) => r.productId === 'p2')?.class).toBe('B');
      expect(result.find((r) => r.productId === 'p3')?.class).toBe('C');
    });

    it('classifica produtos sem nenhuma venda como C', async () => {
      prisma.saleItem.groupBy.mockResolvedValue([{ productId: 'p1', _sum: { total: 1000 } }]);
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', name: 'Vendido', sku: 'V1' },
        { id: 'p2', name: 'Nunca vendido', sku: 'V2' },
      ]);

      const result = await service.getAbcCurve();

      expect(result.find((r) => r.productId === 'p2')).toEqual(
        expect.objectContaining({ revenue: 0, class: 'C' }),
      );
    });

    it('não quebra quando não existe nenhum produto com faturamento (totalRevenue = 0)', async () => {
      prisma.saleItem.groupBy.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'X', sku: 'X' }]);

      const result = await service.getAbcCurve();

      expect(result).toEqual([{ productId: 'p1', name: 'X', sku: 'X', revenue: 0, cumulativePct: 0, class: 'C' }]);
    });
  });

  describe('comparePeriods', () => {
    it('calcula a variação percentual de receita e quantidade de vendas entre dois períodos', async () => {
      prisma.sale.aggregate
        .mockResolvedValueOnce({ _sum: { total: 150 }, _count: 3 }) // período A
        .mockResolvedValueOnce({ _sum: { total: 100 }, _count: 2 }); // período B

      const result = await service.comparePeriods(new Date(), new Date(), new Date(), new Date());

      expect(result.revenueChangePct).toBe(50);
      expect(result.salesCountChangePct).toBe(50);
    });

    it('devolve null na variação quando o período de referência não teve vendas', async () => {
      prisma.sale.aggregate
        .mockResolvedValueOnce({ _sum: { total: 150 }, _count: 3 })
        .mockResolvedValueOnce({ _sum: { total: 0 }, _count: 0 });

      const result = await service.comparePeriods(new Date(), new Date(), new Date(), new Date());

      expect(result.revenueChangePct).toBeNull();
      expect(result.salesCountChangePct).toBeNull();
    });
  });

  describe('metas de venda', () => {
    it('cria a meta quando ainda não existe uma para o mês', async () => {
      prisma.salesGoal.findFirst.mockResolvedValue(null);
      prisma.salesGoal.create.mockResolvedValue({ month: '2026-08', targetAmount: 5000 });

      await service.setGoal('2026-08', 5000);

      expect(prisma.salesGoal.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { month: '2026-08', targetAmount: 5000 } }),
      );
      expect(prisma.salesGoal.update).not.toHaveBeenCalled();
    });

    it('atualiza a meta quando já existe uma para o mês', async () => {
      prisma.salesGoal.findFirst.mockResolvedValue({ id: 'goal-1', month: '2026-08', targetAmount: 4000 });

      await service.setGoal('2026-08', 6000);

      expect(prisma.salesGoal.update).toHaveBeenCalledWith({ where: { id: 'goal-1' }, data: { targetAmount: 6000 } });
      expect(prisma.salesGoal.create).not.toHaveBeenCalled();
    });
  });
});
