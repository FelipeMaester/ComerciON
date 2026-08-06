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
      customerVehicle: { create: jest.fn() },
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
});
