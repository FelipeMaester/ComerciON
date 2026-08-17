import { BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../inventory/stock.service';
import { CouponsService } from '../coupons/coupons.service';
import { AutomationsService } from '../whatsapp/automations.service';
import { AutomationEngineService } from '../automations/automation-engine.service';
import { CashService } from '../cash/cash.service';

describe('SalesService', () => {
  let service: SalesService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stockService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let couponsService: any;
  let automationsService: Record<string, jest.Mock>;
  let automationEngine: { fireEvent: jest.Mock };
  let cashService: { findOpenSessionId: jest.Mock };

  const warehouse = { id: 'warehouse-1' };
  const product = { id: 'product-1', price: 100 };

  beforeEach(() => {
    stockService = { performAdjust: jest.fn().mockResolvedValue(undefined) };
    couponsService = {
      validate: jest.fn(),
      incrementUsage: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      warehouse: { findUnique: jest.fn().mockResolvedValue(warehouse), findFirst: jest.fn().mockResolvedValue(warehouse) },
      customer: { findUnique: jest.fn() },
      product: { findMany: jest.fn().mockResolvedValue([product]) },
      sale: {
        create: jest.fn(),
        findUnique: jest.fn(),
        // Cai na mesma venda que o teste mocou em findUnique, a não ser que ele
        // diga outra coisa. É a leitura final que confirm/returnSale fazem.
        findUniqueOrThrow: jest.fn(() => prisma.sale.findUnique()),
        update: jest.fn(),
        // Mock com a semântica que importa: a mudança de status só "pega" se o
        // status atual for o esperado, como no UPDATE ... WHERE status = ?.
        // Sem isto, os testes de "não pode confirmar duas vezes" passariam
        // mesmo com a conferência de volta só na memória.
        updateMany: jest.fn(async ({ where, data }: any) => {
          const atual = await prisma.sale.findUnique({ where: { id: where.id } });
          if (!atual) return { count: 0 };
          if (where.status && atual.status !== where.status) return { count: 0 };
          // E grava de verdade, para a leitura seguinte enxergar o novo status
          // — é o que o banco faz, e o que o serviço devolve ao chamador.
          Object.assign(atual, data);
          return { count: 1 };
        }),
      },
      saleItem: { createMany: jest.fn().mockResolvedValue({}) },
      salePayment: { createMany: jest.fn().mockResolvedValue({}) },
      financialEntry: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    automationsService = {};
    automationEngine = { fireEvent: jest.fn().mockResolvedValue(undefined) };
    // Sem caixa aberto por padrão: a venda continua funcionando normalmente,
    // só não fica vinculada a nenhuma gaveta.
    cashService = { findOpenSessionId: jest.fn().mockResolvedValue(null) };

    service = new SalesService(
      prisma as unknown as PrismaService,
      stockService as unknown as StockService,
      couponsService as unknown as CouponsService,
      automationsService as unknown as AutomationsService,
      automationEngine as unknown as AutomationEngineService,
      cashService as unknown as CashService,
    );
  });

  describe('create', () => {
    const baseDto = {
      warehouseId: 'warehouse-1',
      items: [{ productId: 'product-1', quantity: 1 }],
    };

    it('cria um orçamento (confirm ausente) sem tocar estoque ou financeiro', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-1' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-1', status: 'QUOTE' });

      const result = await service.create('seller-1', baseDto);

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'QUOTE', total: 100 }) }),
      );
      expect(stockService.performAdjust).not.toHaveBeenCalled();
      expect(prisma.financialEntry.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'sale-1', status: 'QUOTE' });
    });

    it('venda confirmada direto no PDV entra no caixa aberto do operador', async () => {
      // Regressão de um defeito achado só no teste de ponta a ponta: o PDV
      // cria e confirma numa chamada só, e ESTE caminho não vinculava a
      // venda ao caixa — só o de duas etapas (create + confirm) vinculava.
      // Toda venda de balcão ficava fora da conferência do fim do dia.
      cashService.findOpenSessionId.mockResolvedValue('cash-session-1');
      prisma.sale.create.mockResolvedValue({ id: 'sale-pdv' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-pdv', status: 'CONFIRMED' });

      await service.create('seller-1', {
        ...baseDto,
        confirm: true,
        payments: [{ method: 'CASH', amount: 100 }],
      } as never);

      expect(cashService.findOpenSessionId).toHaveBeenCalledWith('seller-1');
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cashSessionId: 'cash-session-1' }) }),
      );
    });

    it('orçamento NÃO entra no caixa — só venda confirmada movimenta a gaveta', async () => {
      cashService.findOpenSessionId.mockResolvedValue('cash-session-1');
      prisma.sale.create.mockResolvedValue({ id: 'sale-quote' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-quote', status: 'QUOTE' });

      await service.create('seller-1', baseDto);

      expect(cashService.findOpenSessionId).not.toHaveBeenCalled();
      const dados = prisma.sale.create.mock.calls[0][0].data;
      expect(dados.cashSessionId).toBeUndefined();
    });

    it('confirma direto (confirm=true) com pagamento cobrindo o total: baixa estoque e gera conta a receber PAGA', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-2' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-2', status: 'CONFIRMED' });

      await service.create('seller-1', {
        ...baseDto,
        confirm: true,
        payments: [{ method: 'CASH', amount: 100 }],
      });

      expect(stockService.performAdjust).toHaveBeenCalledWith(
        prisma,
        'seller-1',
        expect.objectContaining({ productId: 'product-1', warehouseId: 'warehouse-1', type: 'OUT', quantity: 1 }),
      );
      expect(prisma.financialEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'RECEIVABLE', status: 'PAID', amount: 100 }) }),
      );
      expect(automationEngine.fireEvent).toHaveBeenCalledWith('SALE_CONFIRMED', 'SALE', 'sale-2');
    });

    it('não dispara SALE_CONFIRMED quando a venda fica como orçamento (confirm ausente)', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-quote' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-quote' });

      await service.create('seller-1', baseDto);

      expect(automationEngine.fireEvent).not.toHaveBeenCalled();
    });

    it('soma o frete ao total quando shippingCost é informado', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-freight' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-freight' });

      await service.create('seller-1', { ...baseDto, shippingCost: 25 });

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ shippingCost: 25, total: 125 }) }),
      );
    });

    it('zera o frete no servidor quando o cupom aplicado tem frete grátis, mesmo se o cliente mandou um valor', async () => {
      couponsService.validate.mockResolvedValue({ couponId: 'coupon-free', discountAmount: 0, freeShipping: true });
      prisma.sale.create.mockResolvedValue({ id: 'sale-freeship' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-freeship' });

      await service.create('seller-1', { ...baseDto, couponCode: 'FRETEGRATIS', shippingCost: 40 });

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ shippingCost: 0, total: 100 }) }),
      );
    });

    it('soma o repasse de taxa de cartão (cardFeeAmount) ao total', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-cardfee' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-cardfee' });

      await service.create('seller-1', { ...baseDto, cardFeeAmount: 11.61 });

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cardFeeAmount: 11.61, total: 111.61 }) }),
      );
    });




    it('aplica desconto do cupom ao subtotal e incrementa o uso ao confirmar', async () => {
      couponsService.validate.mockResolvedValue({ couponId: 'coupon-1', discountAmount: 20, freeShipping: false });
      prisma.sale.create.mockResolvedValue({ id: 'sale-coupon' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-coupon' });

      await service.create('seller-1', {
        ...baseDto,
        couponCode: 'PROMO20',
        confirm: true,
        payments: [{ method: 'CASH', amount: 80 }],
      });

      expect(couponsService.validate).toHaveBeenCalledWith('PROMO20', 100);
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ discount: 20, total: 80, couponId: 'coupon-1' }) }),
      );
      expect(couponsService.incrementUsage).toHaveBeenCalledWith(prisma, 'coupon-1');
    });

    it('não incrementa o uso do cupom quando a venda fica como orçamento (confirm ausente)', async () => {
      couponsService.validate.mockResolvedValue({ couponId: 'coupon-1', discountAmount: 20, freeShipping: false });
      prisma.sale.create.mockResolvedValue({ id: 'sale-quote-coupon' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-quote-coupon' });

      await service.create('seller-1', { ...baseDto, couponCode: 'PROMO20' });

      expect(couponsService.incrementUsage).not.toHaveBeenCalled();
    });

    it('rejeita confirm=true quando os pagamentos não cobrem o total, sem abrir transação', async () => {
      await expect(
        service.create('seller-1', {
          ...baseDto,
          confirm: true,
          payments: [{ method: 'CASH', amount: 50 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejeita confirm=true sem nenhum pagamento informado', async () => {
      await expect(service.create('seller-1', { ...baseDto, confirm: true })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('confirma fiado (sem pagamento) para cliente parceiro e gera conta a receber no prazo dele', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', paymentTermDays: 15 });
      prisma.sale.create.mockResolvedValue({ id: 'sale-fiado' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-fiado' });

      const before = new Date();
      await service.create('seller-1', { ...baseDto, customerId: 'customer-1', confirm: true });
      const after = new Date();

      expect(stockService.performAdjust).toHaveBeenCalled();
      expect(prisma.financialEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ category: 'Fiado', status: 'PENDING', amount: 100, saleId: 'sale-fiado' }),
        }),
      );
      const dueDate = prisma.financialEntry.create.mock.calls[0][0].data.dueDate as Date;
      const minExpected = new Date(before);
      minExpected.setDate(minExpected.getDate() + 15);
      const maxExpected = new Date(after);
      maxExpected.setDate(maxExpected.getDate() + 15);
      expect(dueDate.getTime()).toBeGreaterThanOrEqual(minExpected.getTime());
      expect(dueDate.getTime()).toBeLessThanOrEqual(maxExpected.getTime());
    });

    it('usa fiadoDays informado na venda em vez do prazo padrão do cliente', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', paymentTermDays: 15 });
      prisma.sale.create.mockResolvedValue({ id: 'sale-fiado-custom' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-fiado-custom' });

      const before = new Date();
      await service.create('seller-1', { ...baseDto, customerId: 'customer-1', confirm: true, fiadoDays: 45 });
      const after = new Date();

      const dueDate = prisma.financialEntry.create.mock.calls[0][0].data.dueDate as Date;
      const minExpected = new Date(before);
      minExpected.setDate(minExpected.getDate() + 45);
      const maxExpected = new Date(after);
      maxExpected.setDate(maxExpected.getDate() + 45);
      expect(dueDate.getTime()).toBeGreaterThanOrEqual(minExpected.getTime());
      expect(dueDate.getTime()).toBeLessThanOrEqual(maxExpected.getTime());
    });

    it('permite fiado para qualquer cliente identificado, mesmo sem prazo padrão configurado, quando fiadoDays é informado', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', paymentTermDays: null });
      prisma.sale.create.mockResolvedValue({ id: 'sale-fiado-no-default' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-fiado-no-default' });

      await service.create('seller-1', { ...baseDto, customerId: 'customer-1', confirm: true, fiadoDays: 30 });

      expect(prisma.financialEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ category: 'Fiado', status: 'PENDING', amount: 100 }) }),
      );
    });

    it('confirma fiado parcial para cliente parceiro: parte paga + parte pendente no prazo dele', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', paymentTermDays: 15 });
      prisma.sale.create.mockResolvedValue({ id: 'sale-fiado-parcial' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-fiado-parcial' });

      await service.create('seller-1', {
        ...baseDto,
        customerId: 'customer-1',
        confirm: true,
        payments: [{ method: 'CASH', amount: 40 }],
      });

      expect(prisma.financialEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ category: 'Vendas', status: 'PAID', amount: 40 }) }),
      );
      expect(prisma.financialEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ category: 'Fiado', status: 'PENDING', amount: 60 }) }),
      );
    });

    it('rejeita pagamentos que somam mais que o total mesmo para cliente parceiro', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', paymentTermDays: 15 });

      await expect(
        service.create('seller-1', {
          ...baseDto,
          customerId: 'customer-1',
          confirm: true,
          payments: [{ method: 'CASH', amount: 150 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita confirm=true sem pagamento para cliente comum (não parceiro), mesmo com customerId', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', paymentTermDays: null });

      await expect(
        service.create('seller-1', { ...baseDto, customerId: 'customer-1', confirm: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('usa o preço do produto quando o cliente informado existe', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
      prisma.sale.create.mockResolvedValue({ id: 'sale-3' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-3' });

      await service.create('seller-1', { ...baseDto, customerId: 'customer-1' });

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ total: 100 }) }),
      );
    });
  });

  describe('confirm', () => {
    it('rejeita confirmar uma venda que não é orçamento', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', status: 'CONFIRMED', items: [], payments: [] });

      await expect(service.confirm('user-1', 'sale-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(stockService.performAdjust).not.toHaveBeenCalled();
    });

    it('confirma com pagamento informado na hora (tela de Vendas), sem pagamento já anexado', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        status: 'QUOTE',
        total: 100,
        warehouseId: 'warehouse-1',
        customerId: null,
        items: [{ productId: 'product-1', quantity: 1 }],
        payments: [],
      });
      prisma.sale.update.mockResolvedValue({ id: 'sale-1', status: 'CONFIRMED' });

      await service.confirm('user-1', 'sale-1', [{ method: 'CASH', amount: 100 }]);

      expect(prisma.salePayment.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [expect.objectContaining({ saleId: 'sale-1', amount: 100 })] }),
      );
      expect(prisma.financialEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PAID', amount: 100 }) }),
      );
      expect(automationEngine.fireEvent).toHaveBeenCalledWith('SALE_CONFIRMED', 'SALE', 'sale-1');
    });

    it('confirma fiado (sem pagamento) na tela de Vendas para cliente parceiro', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-2',
        status: 'QUOTE',
        total: 200,
        warehouseId: 'warehouse-1',
        customerId: 'customer-1',
        items: [{ productId: 'product-1', quantity: 1 }],
        payments: [],
      });
      prisma.customer.findUnique.mockResolvedValue({ paymentTermDays: 10 });
      prisma.sale.update.mockResolvedValue({ id: 'sale-2', status: 'CONFIRMED' });

      await service.confirm('user-1', 'sale-2');

      expect(prisma.salePayment.createMany).not.toHaveBeenCalled();
      expect(prisma.financialEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ category: 'Fiado', status: 'PENDING', amount: 200 }) }),
      );
    });

    it('usa fiadoDays informado na tela de Vendas em vez do prazo padrão do cliente', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-fiado-days',
        status: 'QUOTE',
        total: 150,
        warehouseId: 'warehouse-1',
        customerId: 'customer-1',
        items: [],
        payments: [],
      });
      prisma.customer.findUnique.mockResolvedValue({ paymentTermDays: 10 });
      prisma.sale.update.mockResolvedValue({ id: 'sale-fiado-days', status: 'CONFIRMED' });

      const before = new Date();
      await service.confirm('user-1', 'sale-fiado-days', undefined, 60);
      const after = new Date();

      const dueDate = prisma.financialEntry.create.mock.calls[0][0].data.dueDate as Date;
      const minExpected = new Date(before);
      minExpected.setDate(minExpected.getDate() + 60);
      const maxExpected = new Date(after);
      maxExpected.setDate(maxExpected.getDate() + 60);
      expect(dueDate.getTime()).toBeGreaterThanOrEqual(minExpected.getTime());
      expect(dueDate.getTime()).toBeLessThanOrEqual(maxExpected.getTime());
    });

    it('soma cardFeeAmount ao total fixado no orçamento antes de conferir os pagamentos', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-cardfee',
        status: 'QUOTE',
        total: 100,
        cardFeeAmount: 0,
        warehouseId: 'warehouse-1',
        customerId: null,
        items: [{ productId: 'product-1', quantity: 1 }],
        payments: [],
      });
      prisma.sale.update.mockResolvedValue({ id: 'sale-cardfee', status: 'CONFIRMED' });

      await service.confirm('user-1', 'sale-cardfee', [{ method: 'CASH', amount: 111.61 }], undefined, 11.61);

      expect(prisma.financialEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PAID', amount: 111.61 }) }),
      );
      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cardFeeAmount: { increment: 11.61 }, total: 111.61 }),
        }),
      );
    });

    it('reivindica o status ANTES de baixar o estoque, e a segunda confirmação não passa', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-corrida',
        status: 'QUOTE',
        total: 100,
        warehouseId: 'warehouse-1',
        customerId: null,
        items: [{ productId: 'product-1', quantity: 1 }],
        payments: [],
      });

      await service.confirm('user-1', 'sale-corrida', [{ method: 'CASH', amount: 100 }]);

      // A ordem é o que impede a venda dupla: se a baixa viesse primeiro, duas
      // confirmações simultâneas baixariam as duas antes de qualquer trava.
      const ordemDaReivindicacao = prisma.sale.updateMany.mock.invocationCallOrder[0];
      const ordemDaBaixa = stockService.performAdjust.mock.invocationCallOrder[0];
      expect(ordemDaReivindicacao).toBeLessThan(ordemDaBaixa);
      expect(prisma.sale.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'sale-corrida', status: 'QUOTE' }) }),
      );

      // A venda agora está CONFIRMED; confirmar de novo tem de bater na trave,
      // sem tocar no estoque uma segunda vez.
      stockService.performAdjust.mockClear();
      await expect(service.confirm('user-1', 'sale-corrida', [{ method: 'CASH', amount: 100 }])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(stockService.performAdjust).not.toHaveBeenCalled();
    });

    it('rejeita confirmar sem pagamento suficiente quando o cliente não é parceiro', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-3',
        status: 'QUOTE',
        total: 100,
        warehouseId: 'warehouse-1',
        customerId: 'customer-1',
        items: [],
        payments: [],
      });
      prisma.customer.findUnique.mockResolvedValue({ paymentTermDays: null });

      await expect(service.confirm('user-1', 'sale-3', [{ method: 'CASH', amount: 40 }])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('cancel', () => {
    it('rejeita cancelar uma venda já confirmada (deve usar devolução)', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', status: 'CONFIRMED' });

      await expect(service.cancel('sale-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('returnSale', () => {
    it('rejeita devolver uma venda que não está confirmada', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', status: 'QUOTE', items: [] });

      await expect(service.returnSale('user-1', 'sale-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(stockService.performAdjust).not.toHaveBeenCalled();
    });

    it('devolve uma venda confirmada: repõe estoque (IN) e cancela contas a receber pendentes', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        status: 'CONFIRMED',
        warehouseId: 'warehouse-1',
        items: [{ productId: 'product-1', quantity: 2 }],
      });
      prisma.sale.update.mockResolvedValue({ id: 'sale-1', status: 'RETURNED' });

      const result = await service.returnSale('user-1', 'sale-1');

      expect(stockService.performAdjust).toHaveBeenCalledWith(
        prisma,
        'user-1',
        expect.objectContaining({ productId: 'product-1', type: 'IN', quantity: 2 }),
      );
      expect(prisma.financialEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { saleId: 'sale-1', status: { in: ['PENDING', 'OVERDUE'] } },
          data: { status: 'CANCELED' },
        }),
      );
      expect(result.status).toBe('RETURNED');
    });

    it('devolver o que já foi pago gera contra-lançamento — não some com a entrada', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        status: 'CONFIRMED',
        customerId: 'customer-1',
        warehouseId: 'warehouse-1',
        items: [{ productId: 'product-1', quantity: 5 }],
      });
      // Venda paga à vista: o lançamento nasce PAID e sobrevive ao cancelamento
      // dos PENDING. Antes disso, R$ 500 de uma venda devolvida continuavam
      // valendo no Financeiro enquanto o Dashboard já não os contava.
      prisma.financialEntry.findMany.mockResolvedValue([{ amount: 300 }, { amount: 200 }]);

      await service.returnSale('user-1', 'sale-1');

      expect(prisma.financialEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'PAYABLE',
            category: 'Devoluções',
            amount: 500,
            status: 'PAID',
            saleId: 'sale-1',
          }),
        }),
      );
    });

    it('venda sem nada pago não gera contra-lançamento', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        status: 'CONFIRMED',
        customerId: 'customer-1',
        warehouseId: 'warehouse-1',
        items: [],
      });
      prisma.financialEntry.findMany.mockResolvedValue([]);

      await service.returnSale('user-1', 'sale-1');

      expect(prisma.financialEntry.create).not.toHaveBeenCalled();
    });
  });

  describe('createFromServiceOrder', () => {
    const serviceOrder = {
      id: 'so-1',
      customerId: 'customer-1',
      items: [
        { productId: 'product-1', description: 'Radiador Onix 1.0/1.4', quantity: 1, unitPrice: 360 },
        { productId: null, description: 'Mão de obra - instalação', quantity: 1, unitPrice: 150 },
      ],
    };

    it('cria a venda já confirmada, baixa estoque só dos itens com produto e gera uma conta a receber pendente', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-from-so' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-from-so', status: 'CONFIRMED' });

      const result = await service.createFromServiceOrder(serviceOrder);

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'customer-1',
            warehouseId: 'warehouse-1',
            status: 'CONFIRMED',
            total: 510,
          }),
        }),
      );
      expect(prisma.saleItem.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({ productId: 'product-1', total: 360 }),
            expect.objectContaining({ description: 'Mão de obra - instalação', total: 150 }),
          ],
        }),
      );
      expect(stockService.performAdjust).toHaveBeenCalledTimes(1);
      expect(stockService.performAdjust).toHaveBeenCalledWith(
        prisma,
        undefined,
        expect.objectContaining({ productId: 'product-1', type: 'OUT', quantity: 1 }),
      );
      expect(prisma.financialEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'RECEIVABLE', status: 'PENDING', amount: 510, saleId: 'sale-from-so' }),
        }),
      );
      expect(prisma.salePayment.createMany).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'sale-from-so', status: 'CONFIRMED' });
      expect(automationEngine.fireEvent).toHaveBeenCalledWith('SALE_CONFIRMED', 'SALE', 'sale-from-so');
    });

    it('usa o depósito padrão do tenant', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-from-so' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-from-so' });

      await service.createFromServiceOrder(serviceOrder);

      expect(prisma.warehouse.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { isDefault: true } }));
    });

    it('rejeita quando não há nenhum depósito cadastrado', async () => {
      prisma.warehouse.findFirst.mockResolvedValue(null);

      await expect(service.createFromServiceOrder(serviceOrder)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('adia o vencimento em paymentTermDays quando o cliente é parceiro/fiado', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-from-so' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-from-so' });
      prisma.customer.findUnique.mockResolvedValue({ paymentTermDays: 28 });

      const before = new Date();
      await service.createFromServiceOrder(serviceOrder);
      const after = new Date();

      const dueDate = prisma.financialEntry.create.mock.calls[0][0].data.dueDate as Date;
      const minExpected = new Date(before);
      minExpected.setDate(minExpected.getDate() + 28);
      const maxExpected = new Date(after);
      maxExpected.setDate(maxExpected.getDate() + 28);

      expect(dueDate.getTime()).toBeGreaterThanOrEqual(minExpected.getTime());
      expect(dueDate.getTime()).toBeLessThanOrEqual(maxExpected.getTime());
    });

    it('vence hoje quando o cliente não tem prazo especial', async () => {
      prisma.sale.create.mockResolvedValue({ id: 'sale-from-so' });
      prisma.sale.findUniqueOrThrow.mockResolvedValue({ id: 'sale-from-so' });
      prisma.customer.findUnique.mockResolvedValue({ paymentTermDays: null });

      await service.createFromServiceOrder(serviceOrder);

      const dueDate = prisma.financialEntry.create.mock.calls[0][0].data.dueDate as Date;
      const now = new Date();
      expect(Math.abs(dueDate.getTime() - now.getTime())).toBeLessThan(5000);
    });
  });
});
