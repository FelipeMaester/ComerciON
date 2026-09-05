import { BadRequestException } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { PrismaService } from '../prisma/prisma.service';
import { inicioDeHoje, janelaAVencer } from '../common/vencimento';

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
        findUniqueOrThrow: jest.fn(() => prisma.financialEntry.findUnique()),
        update: jest.fn(),
        // Mesma semântica do banco: a gravação só "pega" se o status atual
        // satisfizer a condição do where. Sem isso, os testes de "já pago" e
        // "já cancelado" passariam mesmo sem a condição no UPDATE.
        updateMany: jest.fn(async ({ where }: any) => {
          const atual = await prisma.financialEntry.findUnique();
          if (!atual) return { count: 0 };
          if (where.status?.in && !where.status.in.includes(atual.status)) return { count: 0 };
          if (where.status?.not && atual.status === where.status.not) return { count: 0 };
          return { count: 1 };
        }),
      },
    };
    service = new FinanceService(prisma as unknown as PrismaService);
  });


  describe('findAll', () => {
    /**
     * Cada venda cria um recebível: um ano de loja são milhares. A lista vinha
     * inteira — medido com 9.000 lançamentos, 4 MB de resposta e 9.000 linhas
     * renderizadas, 470 telas de rolagem.
     */
    beforeEach(() => {
      prisma.financialEntry.findMany.mockResolvedValue([]);
      prisma.financialEntry.count = jest.fn().mockResolvedValue(9000);
    });

    it('pede uma página ao banco, e não a tabela inteira', async () => {
      await service.findAll(undefined, undefined, undefined, undefined, undefined, { page: 3, pageSize: 25 });

      const [args] = prisma.financialEntry.findMany.mock.calls[0];
      expect(args.skip).toBe(50);
      expect(args.take).toBe(25);
    });

    it('devolve o total da LOJA, não o da página', async () => {
      const pagina = await service.findAll();

      // É o total que faz a paginação existir na tela. Sem ele, a pessoa vê 25
      // lançamentos e conclui que são todos.
      expect(pagina.total).toBe(9000);
      expect(pagina.totalPages).toBe(360);
    });

    it('"só vencidas" filtra no banco, com a regra do sino', async () => {
      // A tela filtrava isto no navegador, sobre a lista inteira. Com a lista
      // paginada, filtrar lá mostraria "as vencidas DESTA PÁGINA" — três onde
      // a loja tem duzentas.
      await service.findAll(undefined, undefined, undefined, undefined, 'vencidas');

      const [{ where }] = prisma.financialEntry.findMany.mock.calls[0];
      expect(where.status).toBe('PENDING');
      expect(where.dueDate.lt).toEqual(inicioDeHoje());
    });

    it('"a vencer" usa a MESMA janela que o sino conta', async () => {
      // O sino contava dias 0, 1 e 2; a tela incluía o dia 3. Medido com uma
      // conta vencendo à meia-noite do terceiro dia: sino 12, tela 13 — para a
      // mesma pergunta, no mesmo clique.
      await service.findAll(undefined, undefined, undefined, undefined, 'a-vencer');

      const [{ where }] = prisma.financialEntry.findMany.mock.calls[0];
      const janela = janelaAVencer();
      expect(where.dueDate).toEqual({ gte: janela.de, lt: janela.ate });
      // Meio-aberta: "próximos 3 dias" é hoje, amanhã e depois. O dia 3 é o quarto.
      expect(Math.round((janela.ate.getTime() - janela.de.getTime()) / 86_400_000)).toBe(3);
    });

    it('sem recorte, não inventa filtro de vencimento', async () => {
      // Controle: quem abre o Financeiro sem clicar em nada precisa ver tudo.
      await service.findAll();

      const [{ where }] = prisma.financialEntry.findMany.mock.calls[0];
      expect(where.dueDate).toBeUndefined();
      expect(where.status).toBeUndefined();
    });
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
