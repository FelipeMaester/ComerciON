import { BadRequestException } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FinanceService', () => {
  let service: FinanceService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(() => {
    prisma = {
      financialEntry: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new FinanceService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('rejeita PAYABLE com customerId', async () => {
      await expect(
        service.create({
          type: 'PAYABLE',
          description: 'Aluguel',
          amount: 100,
          dueDate: '2026-01-01',
          customerId: 'customer-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita RECEIVABLE com supplierId', async () => {
      await expect(
        service.create({
          type: 'RECEIVABLE',
          description: 'Venda',
          amount: 100,
          dueDate: '2026-01-01',
          supplierId: 'supplier-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('markPaid / cancel', () => {
    it('não permite pagar um lançamento já cancelado', async () => {
      prisma.financialEntry.findUnique.mockResolvedValue({ id: 'e1', status: 'CANCELED' });
      await expect(service.markPaid('e1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('não permite cancelar um lançamento já pago', async () => {
      prisma.financialEntry.findUnique.mockResolvedValue({ id: 'e1', status: 'PAID' });
      await expect(service.cancel('e1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cashFlow', () => {
    it('separa previsto (por vencimento) de realizado (por pagamento) dentro do período', async () => {
      const from = new Date('2026-01-01');
      const to = new Date('2026-01-31');

      prisma.financialEntry.findMany.mockResolvedValue([
        // recebível vencendo no período, ainda não pago -> entra só no previsto
        { type: 'RECEIVABLE', amount: 100, dueDate: new Date('2026-01-10'), paidAt: null, status: 'PENDING' },
        // pagável vencendo e pago no período -> entra em previsto E realizado
        { type: 'PAYABLE', amount: 40, dueDate: new Date('2026-01-15'), paidAt: new Date('2026-01-15'), status: 'PAID' },
        // recebível pago no período mas com vencimento fora do período -> só realizado
        { type: 'RECEIVABLE', amount: 60, dueDate: new Date('2025-12-01'), paidAt: new Date('2026-01-05'), status: 'PAID' },
      ]);

      const result = await service.cashFlow(from, to);

      expect(result.previsto).toEqual({ receitas: 100, despesas: 40, saldo: 60 });
      expect(result.realizado).toEqual({ receitas: 60, despesas: 40, saldo: 20 });
    });
  });
});
