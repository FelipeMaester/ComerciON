import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(() => {
    prisma = {
      sale: { aggregate: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      salePayment: { groupBy: jest.fn().mockResolvedValue([]) },
      saleItem: { groupBy: jest.fn() },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      salesGoal: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      opportunity: { aggregate: jest.fn(), count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      task: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
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

  describe('getDailySeries', () => {
    /** Ontem às 22h — depois das 21h, o dia em UTC já virou. */
    function ontemTardeDaNoite(): Date {
      const hoje = new Date();
      return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1, 22, 30, 0);
    }

    function chaveLocal(data: Date): string {
      return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    }

    it('devolve um ponto por dia, mesmo nos dias sem venda nenhuma', async () => {
      prisma.sale.findMany.mockResolvedValue([]);

      const serie = await service.getDailySeries(7);

      expect(serie).toHaveLength(7);
      expect(serie.every((p) => p.total === 0 && p.count === 0)).toBe(true);
      // Último ponto é hoje, e os dias saem em ordem crescente.
      expect(serie[6].day).toBe(chaveLocal(new Date()));
      expect([...serie].sort((a, b) => a.day.localeCompare(b.day))).toEqual(serie);
    });

    it('soma as vendas no dia local, não no dia em UTC', async () => {
      // Uma venda às 22h30 de ontem, no fuso de Brasília, já é "amanhã" em UTC.
      // Com toISOString() ela cairia na coluna de hoje — um dia inteiro de
      // faturamento no lugar errado do gráfico.
      const venda = ontemTardeDaNoite();
      prisma.sale.findMany.mockResolvedValue([{ confirmedAt: venda, total: 250 }]);

      const serie = await service.getDailySeries(7);
      const ontem = serie.find((p) => p.day === chaveLocal(venda));
      const hoje = serie.find((p) => p.day === chaveLocal(new Date()));

      expect(ontem).toEqual({ day: chaveLocal(venda), total: 250, count: 1 });
      expect(hoje?.total).toBe(0);
    });

    it('agrupa várias vendas do mesmo dia num ponto só', async () => {
      const dia = new Date(new Date().setHours(9, 0, 0, 0));
      prisma.sale.findMany.mockResolvedValue([
        { confirmedAt: dia, total: 100.5 },
        { confirmedAt: new Date(new Date().setHours(15, 0, 0, 0)), total: 99.5 },
      ]);

      const serie = await service.getDailySeries(7);

      expect(serie[6]).toEqual({ day: chaveLocal(dia), total: 200, count: 2 });
    });
  });

  describe('getPaymentMix', () => {
    it('ordena as formas de pagamento da maior para a menor', async () => {
      prisma.salePayment.groupBy.mockResolvedValue([
        { method: 'CASH', _sum: { amount: 100 }, _count: 2 },
        { method: 'PIX', _sum: { amount: 900 }, _count: 5 },
        { method: 'CREDIT_CARD', _sum: { amount: 500 }, _count: 3 },
      ]);

      const mix = await service.getPaymentMix(new Date('2026-08-01'), new Date('2026-09-01'));

      expect(mix.map((f) => f.method)).toEqual(['PIX', 'CREDIT_CARD', 'CASH']);
      expect(mix[0]).toEqual({ method: 'PIX', total: 900, count: 5 });
    });

    it('sai do pagamento e não do total da venda, para venda dividida contar nos dois', async () => {
      prisma.salePayment.groupBy.mockResolvedValue([]);
      await service.getPaymentMix(new Date('2026-08-01'), new Date('2026-09-01'));

      const [args] = prisma.salePayment.groupBy.mock.calls[0];
      expect(args.by).toEqual(['method']);
      expect(args._sum).toEqual({ amount: true });
      expect(args.where.sale.status).toBe('CONFIRMED');
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

  describe('getSummary — indicadores de pipeline', () => {
    beforeEach(() => {
      prisma.sale.aggregate.mockResolvedValue({ _sum: { total: 0 }, _count: 0 });
      prisma.saleItem.groupBy.mockResolvedValue([]);
    });

    it('inclui contagem, valor total e oportunidades paradas do funil aberto', async () => {
      prisma.opportunity.aggregate.mockResolvedValue({ _count: 3, _sum: { estimatedValue: 1250.5 } });
      prisma.opportunity.count.mockResolvedValue(2);
      prisma.opportunity.findMany.mockResolvedValue([{ id: 'opp-1' }]);

      const summary = await service.getSummary();

      expect(summary.pipeline).toEqual({
        openCount: 3,
        openValue: 1250.5,
        staleCount: 2,
        staleOpportunities: [{ id: 'opp-1' }],
      });
    });

    it('zera o valor quando não há oportunidades abertas', async () => {
      prisma.opportunity.aggregate.mockResolvedValue({ _count: 0, _sum: { estimatedValue: null } });
      prisma.opportunity.count.mockResolvedValue(0);

      const summary = await service.getSummary();

      expect(summary.pipeline.openCount).toBe(0);
      expect(summary.pipeline.openValue).toBe(0);
    });

    it('inclui contagem de tarefas atrasadas e de hoje', async () => {
      prisma.opportunity.aggregate.mockResolvedValue({ _count: 0, _sum: { estimatedValue: null } });
      prisma.opportunity.count.mockResolvedValue(0);
      prisma.task.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2);
      prisma.task.findMany.mockResolvedValue([{ id: 'task-1' }]);

      const summary = await service.getSummary();

      expect(summary.tasks).toEqual({ overdueCount: 4, todayCount: 2, overdueTasks: [{ id: 'task-1' }] });
    });
  });

  describe('getOverdueTasks', () => {
    it('busca tarefas pendentes com vencimento antes de hoje', async () => {
      prisma.task.findMany.mockResolvedValue([{ id: 'task-1' }]);

      const result = await service.getOverdueTasks(5);

      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'PENDING', dueDate: { lt: expect.any(Date) } },
          take: 5,
        }),
      );
      expect(result).toEqual([{ id: 'task-1' }]);
    });
  });
});
