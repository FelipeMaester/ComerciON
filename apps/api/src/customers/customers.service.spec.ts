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
      quote: { findMany: jest.fn() },
      sale: { findMany: jest.fn() },
      financialEntry: { findMany: jest.fn().mockResolvedValue([]) },
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

      expect(result).toEqual({ customer, quotes, sales, outstandingBalance: 0, overdueBalance: 0 });
      expect(prisma.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { customerId: 'customer-1' } }),
      );
      expect(prisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { customerId: 'customer-1', serviceOrder: null } }),
      );
    });

    it('soma o saldo em aberto e separa o que já está vencido', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', name: 'João Silva' });
      prisma.quote.findMany.mockResolvedValue([]);
      prisma.sale.findMany.mockResolvedValue([]);
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
      prisma.financialEntry.findMany.mockResolvedValue([
        { amount: 100, dueDate: past },
        { amount: 50, dueDate: future },
      ]);

      const result = await service.getCustomerHistory('customer-1');

      expect(result.outstandingBalance).toBe(150);
      expect(result.overdueBalance).toBe(100);
    });
  });
});
