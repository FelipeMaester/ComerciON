import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuoteStatus } from '@prisma/client';
import { QuotesService } from './quotes.service';
import { PrismaService } from '../prisma/prisma.service';

describe('QuotesService', () => {
  let service: QuotesService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const baseDto = {
    customerId: 'customer-1',
    items: [
      { description: 'Troca de óleo', quantity: 1, unitPrice: 80 },
      { description: 'Filtro de óleo', quantity: 1, unitPrice: 40, productId: 'product-1' },
    ],
  };

  beforeEach(() => {
    prisma = {
      customer: { findUnique: jest.fn() },
      customerVehicle: { findUnique: jest.fn() },
      quote: {
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(() => prisma.quote.findUnique()),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        // Mock com a semântica do banco: a resposta só "pega" se o orçamento
        // ainda estiver PENDING. Sem isto, os testes de "já foi respondido"
        // passariam mesmo com a conferência de volta só na memória.
        updateMany: jest.fn(async ({ where, data }: any) => {
          const atual = await prisma.quote.findUnique();
          if (!atual) return { count: 0 };
          if (where.status && atual.status !== where.status) return { count: 0 };
          Object.assign(atual, data);
          return { count: 1 };
        }),
      },
      quoteItem: { createMany: jest.fn().mockResolvedValue({}) },
      serviceOrder: { create: jest.fn(), findUniqueOrThrow: jest.fn() },
      serviceOrderItem: { createMany: jest.fn().mockResolvedValue({}) },
      pipelineStage: { findFirst: jest.fn() },
      opportunity: { update: jest.fn() },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    service = new QuotesService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('rejeita quando o cliente não existe', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(service.create(baseDto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita quando o veículo não pertence ao cliente informado', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
      prisma.customerVehicle.findUnique.mockResolvedValue({ id: 'vehicle-1', customerId: 'outro-cliente' });

      await expect(service.create({ ...baseDto, vehicleId: 'vehicle-1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('soma os itens no total e cria orçamento + itens numa transação', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
      prisma.quote.create.mockResolvedValue({ id: 'quote-1', tenantId: 'tenant-1' });
      prisma.quote.findUniqueOrThrow.mockResolvedValue({ id: 'quote-1', total: 120 });

      await service.create(baseDto);

      expect(prisma.quote.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ customerId: 'customer-1', total: 120 }) }),
      );
      expect(prisma.quoteItem.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({ quoteId: 'quote-1', description: 'Troca de óleo', quantity: 1, unitPrice: 80 }),
            expect.objectContaining({ quoteId: 'quote-1', productId: 'product-1', unitPrice: 40 }),
          ],
        }),
      );
    });
  });

  describe('approveByToken', () => {
    it('rejeita token inexistente', async () => {
      prisma.quote.findUnique.mockResolvedValue(null);
      await expect(service.approveByToken('token-inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita orçamento que já foi respondido', async () => {
      prisma.quote.findUnique.mockResolvedValue({ id: 'quote-1', status: QuoteStatus.APPROVED, items: [] });
      await expect(service.approveByToken('token-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('aprova o orçamento e cria a ordem de serviço com os mesmos itens', async () => {
      const quote = {
        id: 'quote-1',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        vehicleId: 'vehicle-1',
        description: 'Barulho no motor',
        total: 120,
        status: QuoteStatus.PENDING,
        items: [{ productId: null, description: 'Troca de óleo', quantity: 1, unitPrice: 80 }],
      };
      prisma.quote.findUnique.mockResolvedValue(quote);
      prisma.serviceOrder.create.mockResolvedValue({ id: 'so-1' });
      prisma.serviceOrder.findUniqueOrThrow.mockResolvedValue({ id: 'so-1', items: [] });

      await service.approveByToken('token-1');

      expect(prisma.quote.updateMany).toHaveBeenCalledWith(
        // A condição de status no where é o que impede aprovar e recusar juntos.
        expect.objectContaining({ where: { id: 'quote-1', status: QuoteStatus.PENDING }, data: expect.objectContaining({ status: QuoteStatus.APPROVED }) }),
      );
      expect(prisma.serviceOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 'tenant-1', quoteId: 'quote-1', customerId: 'customer-1' }),
        }),
      );
      expect(prisma.serviceOrderItem.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ tenantId: 'tenant-1', serviceOrderId: 'so-1', description: 'Troca de óleo' })],
        }),
      );
    });

    it('move a oportunidade vinculada para a etapa de ganho quando o orçamento é aprovado', async () => {
      const quote = {
        id: 'quote-1',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        vehicleId: null,
        opportunityId: 'opp-1',
        description: null,
        total: 120,
        status: QuoteStatus.PENDING,
        items: [],
      };
      prisma.quote.findUnique.mockResolvedValue(quote);
      prisma.serviceOrder.create.mockResolvedValue({ id: 'so-1' });
      prisma.serviceOrder.findUniqueOrThrow.mockResolvedValue({ id: 'so-1', items: [] });
      prisma.pipelineStage.findFirst.mockResolvedValue({ id: 'stage-ganho', isWonStage: true });

      await service.approveByToken('token-1');

      expect(prisma.pipelineStage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-1', isWonStage: true } }),
      );
      expect(prisma.opportunity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'opp-1' },
          data: expect.objectContaining({ stageId: 'stage-ganho', status: 'WON' }),
        }),
      );
    });

    it('não mexe em oportunidade quando o orçamento não tem uma vinculada', async () => {
      const quote = {
        id: 'quote-1',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        vehicleId: null,
        opportunityId: null,
        description: null,
        total: 120,
        status: QuoteStatus.PENDING,
        items: [],
      };
      prisma.quote.findUnique.mockResolvedValue(quote);
      prisma.serviceOrder.create.mockResolvedValue({ id: 'so-1' });
      prisma.serviceOrder.findUniqueOrThrow.mockResolvedValue({ id: 'so-1', items: [] });

      await service.approveByToken('token-1');

      expect(prisma.pipelineStage.findFirst).not.toHaveBeenCalled();
      expect(prisma.opportunity.update).not.toHaveBeenCalled();
    });
  });

  describe('approveById', () => {
    it('rejeita id inexistente', async () => {
      prisma.quote.findUnique.mockResolvedValue(null);
      await expect(service.approveById('quote-inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita orçamento que já foi respondido', async () => {
      prisma.quote.findUnique.mockResolvedValue({ id: 'quote-1', status: QuoteStatus.REJECTED, items: [] });
      await expect(service.approveById('quote-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('aprova manualmente e cria a ordem de serviço, igual à aprovação por token', async () => {
      const quote = {
        id: 'quote-1',
        tenantId: 'tenant-1',
        customerId: 'customer-1',
        vehicleId: 'vehicle-1',
        description: 'Barulho no motor',
        total: 120,
        status: QuoteStatus.PENDING,
        items: [{ productId: null, description: 'Troca de óleo', quantity: 1, unitPrice: 80 }],
      };
      prisma.quote.findUnique.mockResolvedValue(quote);
      prisma.serviceOrder.create.mockResolvedValue({ id: 'so-1' });
      prisma.serviceOrder.findUniqueOrThrow.mockResolvedValue({ id: 'so-1', items: [] });

      await service.approveById('quote-1');

      expect(prisma.quote.updateMany).toHaveBeenCalledWith(
        // A condição de status no where é o que impede aprovar e recusar juntos.
        expect.objectContaining({ where: { id: 'quote-1', status: QuoteStatus.PENDING }, data: expect.objectContaining({ status: QuoteStatus.APPROVED }) }),
      );
      expect(prisma.serviceOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1', quoteId: 'quote-1' }) }),
      );
    });
  });

  describe('rejectById', () => {
    it('rejeita id inexistente', async () => {
      prisma.quote.findUnique.mockResolvedValue(null);
      await expect(service.rejectById('quote-inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marca o orçamento como recusado manualmente', async () => {
      prisma.quote.findUnique.mockResolvedValue({ id: 'quote-1', status: QuoteStatus.PENDING });
      prisma.quote.update.mockResolvedValue({ id: 'quote-1', status: QuoteStatus.REJECTED });

      await service.rejectById('quote-1');

      expect(prisma.quote.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'quote-1', status: QuoteStatus.PENDING }, data: expect.objectContaining({ status: QuoteStatus.REJECTED }) }),
      );
    });

    it('move a oportunidade vinculada para a etapa de perdido quando o orçamento é recusado', async () => {
      prisma.quote.findUnique.mockResolvedValue({
        id: 'quote-1',
        tenantId: 'tenant-1',
        opportunityId: 'opp-1',
        status: QuoteStatus.PENDING,
      });
      prisma.quote.update.mockResolvedValue({ id: 'quote-1', status: QuoteStatus.REJECTED });
      prisma.pipelineStage.findFirst.mockResolvedValue({ id: 'stage-perdido', isLostStage: true });

      await service.rejectById('quote-1');

      expect(prisma.pipelineStage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-1', isLostStage: true } }),
      );
      expect(prisma.opportunity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'opp-1' },
          data: expect.objectContaining({ stageId: 'stage-perdido', status: 'LOST' }),
        }),
      );
    });
  });

  describe('rejectByToken', () => {
    it('rejeita token inexistente', async () => {
      prisma.quote.findUnique.mockResolvedValue(null);
      await expect(service.rejectByToken('token-inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita orçamento que já foi respondido', async () => {
      prisma.quote.findUnique.mockResolvedValue({ id: 'quote-1', status: QuoteStatus.REJECTED });
      await expect(service.rejectByToken('token-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('marca o orçamento como recusado', async () => {
      prisma.quote.findUnique.mockResolvedValue({ id: 'quote-1', status: QuoteStatus.PENDING });
      prisma.quote.update.mockResolvedValue({ id: 'quote-1', status: QuoteStatus.REJECTED });

      await service.rejectByToken('token-1');

      expect(prisma.quote.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'quote-1', status: QuoteStatus.PENDING }, data: expect.objectContaining({ status: QuoteStatus.REJECTED }) }),
      );
    });
  });
});
