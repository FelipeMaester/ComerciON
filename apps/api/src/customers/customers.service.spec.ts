import { NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CustomersService', () => {
  let service: CustomersService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(() => {
    prisma = {
      customer: { findUnique: jest.fn(), findFirst: jest.fn() },
      customerVehicle: { create: jest.fn(), findUnique: jest.fn() },
      quote: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      sale: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      financialEntry: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      opportunity: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      task: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    service = new CustomersService(prisma as unknown as PrismaService);
  });

  describe('addVehicle', () => {
    it('rejeita quando o cliente não existe', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(service.addVehicle('customer-1', { plate: 'ABC1234' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('normaliza a placa (maiúsculas, sem hífen) antes de salvar', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
      prisma.customerVehicle.create.mockResolvedValue({ id: 'vehicle-1', plate: 'ABC1234' });

      await service.addVehicle('customer-1', { plate: 'abc-1234' });

      expect(prisma.customerVehicle.create).toHaveBeenCalledWith({
        data: { customerId: 'customer-1', plate: 'ABC1234' },
      });
    });

    it('aceita placa no formato Mercosul', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
      prisma.customerVehicle.create.mockResolvedValue({ id: 'vehicle-1', plate: 'ABC1D23' });

      await service.addVehicle('customer-1', { plate: 'abc1d23' });

      expect(prisma.customerVehicle.create).toHaveBeenCalledWith({
        data: { customerId: 'customer-1', plate: 'ABC1D23' },
      });
    });

    it('salva marca, modelo, cor e ano junto com a placa', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
      prisma.customerVehicle.create.mockResolvedValue({ id: 'vehicle-1' });

      await service.addVehicle('customer-1', {
        plate: 'abc-1234',
        brand: 'Fiat',
        model: 'Uno',
        color: 'Branco',
        year: 2020,
      });

      expect(prisma.customerVehicle.create).toHaveBeenCalledWith({
        data: {
          customerId: 'customer-1',
          plate: 'ABC1234',
          brand: 'Fiat',
          model: 'Uno',
          color: 'Branco',
          year: 2020,
        },
      });
    });
  });

  describe('getVehicleHistory', () => {
    it('rejeita quando o veículo não existe', async () => {
      prisma.customerVehicle.findUnique.mockResolvedValue(null);
      await expect(service.getVehicleHistory('vehicle-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna o veículo com orçamentos e ordens de serviço', async () => {
      const vehicle = { id: 'vehicle-1', plate: 'ABC1234', quotes: [{ id: 'quote-1' }], serviceOrders: [{ id: 'so-1' }] };
      prisma.customerVehicle.findUnique.mockResolvedValue(vehicle);

      const result = await service.getVehicleHistory('vehicle-1');

      expect(result).toEqual(vehicle);
    });
  });

  describe('getCustomerHistory', () => {
    it('rejeita quando o cliente não existe', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(service.getCustomerHistory('customer-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna orçamentos (serviços) e vendas sem ordem de serviço (compras)', async () => {
      const customer = { id: 'customer-1', name: 'João Silva' };
      const quotes = [{ id: 'quote-1' }];
      const sales = [{ id: 'sale-1' }];
      prisma.customer.findUnique.mockResolvedValue(customer);
      prisma.quote.findMany.mockResolvedValue(quotes);
      prisma.sale.findMany.mockResolvedValue(sales);

      const result = await service.getCustomerHistory('customer-1');

      expect(result).toEqual({
        customer,
        quotes,
        sales,
        opportunities: [],
        tasks: [],
        totais: { quotes: 0, sales: 0, opportunities: 0, tasks: 0 },
        outstandingBalance: 0,
        overdueBalance: 0,
      });
      expect(prisma.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { customerId: 'customer-1' } }),
      );
      expect(prisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { customerId: 'customer-1', serviceOrder: null } }),
      );
    });

    /**
     * A ficha do cliente antigo baixava 922.204 bytes: 460 vendas com itens e
     * pagamentos, 120 orçamentos com itens e produtos — na tela que o
     * balconista abre com o cliente esperando na frente dele.
     */
    it('traz só as mais recentes de cada coisa, e diz quantas existem', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', name: 'João Silva' });
      prisma.sale.count.mockResolvedValue(460);
      prisma.quote.count.mockResolvedValue(120);

      const result = await service.getCustomerHistory('customer-1');

      for (const consulta of [prisma.quote.findMany, prisma.sale.findMany, prisma.opportunity.findMany, prisma.task.findMany]) {
        expect(consulta).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
      }
      // O total vem do banco: sem ele a tela mostraria dez linhas e quem lê
      // concluiria que o cliente comprou dez vezes.
      expect(result.totais).toEqual({ quotes: 120, sales: 460, opportunities: 0, tasks: 0 });
    });

    /**
     * O defeito que quase entrou junto com a correção acima.
     *
     * O saldo era somado em memória, sobre a lista de contas pendentes. Pôr
     * teto nessa lista faria a soma considerar só as que couberam: a dívida
     * apareceria MENOR do que é, num número redondo e convincente — e esta
     * tela existe justamente para decidir se dá para vender fiado de novo.
     */
    it('soma o saldo no banco, não sobre uma lista com teto', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', name: 'João Silva' });
      prisma.financialEntry.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 8450.75 } })
        .mockResolvedValueOnce({ _sum: { amount: 1200 } });

      const result = await service.getCustomerHistory('customer-1');

      expect(result.outstandingBalance).toBe(8450.75);
      expect(result.overdueBalance).toBe(1200);
      // Nenhuma conta a receber é CARREGADA para isto: só somada.
      expect(prisma.financialEntry.findMany).not.toHaveBeenCalled();
      // E "vencida" é antes do começo de hoje — conta que vence hoje não está
      // vencida. Mesma regra do sino e da tela do financeiro.
      expect(prisma.financialEntry.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ dueDate: { lt: expect.any(Date) } }),
        }),
      );
    });
  });
});
