import { BadRequestException } from '@nestjs/common';
import { CashMovementType, CashSessionStatus, PaymentMethod, Prisma } from '@prisma/client';
import { CashService } from './cash.service';
import { PrismaService } from '../prisma/prisma.service';

const USER = 'user-1';
const dec = (n: number) => new Prisma.Decimal(n);

describe('CashService', () => {
  let service: CashService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const openSession = { id: 'sess-1', operatorId: USER, status: CashSessionStatus.OPEN, openingAmount: dec(100) };

  /** Configura os agregados que alimentam o cálculo do valor esperado. */
  function mockTotals(opts: { payments?: { method: PaymentMethod; amount: number }[]; movements?: { type: CashMovementType; amount: number }[]; salesCount?: number } = {}) {
    prisma.salePayment.groupBy.mockResolvedValue(
      (opts.payments ?? []).map((p) => ({ method: p.method, _sum: { amount: dec(p.amount) } })),
    );
    prisma.cashMovement.groupBy.mockResolvedValue(
      (opts.movements ?? []).map((m) => ({ type: m.type, _sum: { amount: dec(m.amount) } })),
    );
    prisma.sale.count.mockResolvedValue(opts.salesCount ?? 0);
  }

  beforeEach(() => {
    prisma = {
      cashSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(openSession),
        update: jest.fn().mockImplementation(({ data }: { data: unknown }) => ({ ...openSession, ...(data as object) })),
      },
      cashMovement: { create: jest.fn().mockResolvedValue({}), groupBy: jest.fn().mockResolvedValue([]) },
      salePayment: { groupBy: jest.fn().mockResolvedValue([]) },
      sale: { count: jest.fn().mockResolvedValue(0) },
    };
    mockTotals();
    service = new CashService(prisma as unknown as PrismaService);
  });

  describe('composição da gaveta', () => {
    it('só conta dinheiro vivo — cartão, pix e boleto ficam de fora do esperado', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(openSession);
      mockTotals({
        payments: [
          { method: PaymentMethod.CASH, amount: 250 },
          { method: PaymentMethod.CREDIT_CARD, amount: 800 },
          { method: PaymentMethod.PIX, amount: 300 },
          { method: PaymentMethod.DEBIT_CARD, amount: 120 },
        ],
        salesCount: 9,
      });

      const result = await service.getCurrent(USER);

      // Abertura 100 + 250 em dinheiro. Os 1.220 de cartão/pix não estão na
      // gaveta — quem contar as cédulas vai encontrar 350, não 1.570.
      expect(result?.summary.cashSales).toBe(250);
      expect(result?.summary.nonCashSales).toBe(1220);
      expect(result?.summary.expectedAmount).toBe(350);
      expect(result?.summary.salesCount).toBe(9);
    });

    it('suprimento entra e sangria sai do esperado', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(openSession);
      mockTotals({
        payments: [{ method: PaymentMethod.CASH, amount: 500 }],
        movements: [
          { type: CashMovementType.DEPOSIT, amount: 50 },
          { type: CashMovementType.WITHDRAWAL, amount: 200 },
        ],
      });

      const result = await service.getCurrent(USER);

      // 100 + 500 + 50 − 200
      expect(result?.summary.expectedAmount).toBe(450);
    });

    it('devolve null quando o operador não tem caixa aberto', async () => {
      expect(await service.getCurrent(USER)).toBeNull();
    });
  });

  describe('open', () => {
    it('impede abrir um segundo caixa com um já aberto', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(openSession);

      await expect(service.open(USER, { openingAmount: 100 })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cashSession.create).not.toHaveBeenCalled();
    });

    it('abre registrando o troco inicial', async () => {
      await service.open(USER, { openingAmount: 150.5 });

      expect(prisma.cashSession.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ operatorId: USER }) }),
      );
    });
  });

  describe('sangria e suprimento', () => {
    it('recusa sangria maior que o dinheiro em caixa', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(openSession);
      mockTotals({ payments: [{ method: PaymentMethod.CASH, amount: 50 }] }); // esperado = 150

      // Tirar 500 de uma gaveta com 150 deixaria o esperado negativo, o que
      // não significa nada num fechamento.
      await expect(
        service.addMovement(USER, { type: CashMovementType.WITHDRAWAL, amount: 500, reason: 'cofre' }),
      ).rejects.toThrow(/maior que o dinheiro em caixa/);
      expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    });

    it('permite sangria até o limite disponível', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(openSession);
      mockTotals({ payments: [{ method: PaymentMethod.CASH, amount: 50 }] }); // esperado = 150

      await service.addMovement(USER, { type: CashMovementType.WITHDRAWAL, amount: 150, reason: 'cofre' });

      expect(prisma.cashMovement.create).toHaveBeenCalled();
    });

    it('não limita suprimento pelo saldo — é dinheiro entrando', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(openSession);
      mockTotals();

      await service.addMovement(USER, { type: CashMovementType.DEPOSIT, amount: 9999, reason: 'reforço de troco' });

      expect(prisma.cashMovement.create).toHaveBeenCalled();
    });

    it('exige caixa aberto para lançar movimento', async () => {
      await expect(
        service.addMovement(USER, { type: CashMovementType.DEPOSIT, amount: 10, reason: 'troco' }),
      ).rejects.toThrow(/Nenhum caixa aberto/);
    });
  });

  describe('fechamento', () => {
    it('registra sobra quando contou mais que o esperado', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(openSession);
      mockTotals({ payments: [{ method: PaymentMethod.CASH, amount: 400 }] }); // esperado = 500

      await service.close(USER, { countedAmount: 510 });

      expect(prisma.cashSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CashSessionStatus.CLOSED,
            difference: dec(10),
          }),
        }),
      );
    });

    it('registra falta como diferença negativa', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(openSession);
      mockTotals({ payments: [{ method: PaymentMethod.CASH, amount: 400 }] }); // esperado = 500

      await service.close(USER, { countedAmount: 480, closingNotes: 'faltou troco' });

      expect(prisma.cashSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ difference: dec(-20) }) }),
      );
    });

    it('guarda contado e esperado, não só a diferença', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(openSession);
      mockTotals({ payments: [{ method: PaymentMethod.CASH, amount: 400 }] });

      await service.close(USER, { countedAmount: 500 });

      const { data } = prisma.cashSession.update.mock.calls[0][0];
      expect(data.countedAmount).toEqual(dec(500));
      expect(data.expectedAmount).toEqual(dec(500));
      expect(data.difference).toEqual(dec(0));
    });

    it('não deixa fechar sem caixa aberto', async () => {
      await expect(service.close(USER, { countedAmount: 100 })).rejects.toThrow(/Nenhum caixa aberto/);
    });
  });

  describe('vínculo com a venda', () => {
    it('devolve o id da sessão aberta para o SalesService amarrar a venda', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(openSession);

      expect(await service.findOpenSessionId(USER)).toBe('sess-1');
    });

    it('devolve null sem caixa aberto — a venda acontece do mesmo jeito', async () => {
      expect(await service.findOpenSessionId(USER)).toBeNull();
    });

    it('devolve null quando não há operador (venda da loja virtual)', async () => {
      expect(await service.findOpenSessionId(undefined)).toBeNull();
      expect(prisma.cashSession.findFirst).not.toHaveBeenCalled();
    });

    it('só soma vendas CONFIRMADAS — devolução sai da conta sozinha', async () => {
      prisma.cashSession.findFirst.mockResolvedValue(openSession);
      await service.getCurrent(USER);

      // O filtro por status é o que faz uma venda devolvida deixar de contar,
      // acompanhando o dinheiro que saiu fisicamente da gaveta no estorno.
      expect(prisma.salePayment.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sale: { cashSessionId: 'sess-1', status: 'CONFIRMED' } },
        }),
      );
    });
  });
});
