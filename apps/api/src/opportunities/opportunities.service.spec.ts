import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEngineService } from '../automations/automation-engine.service';

describe('OpportunitiesService', () => {
  let service: OpportunitiesService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let automationEngine: { fireEvent: jest.Mock };

  beforeEach(() => {
    prisma = {
      customer: { findUnique: jest.fn() },
      pipelineStage: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
      opportunity: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    };
    automationEngine = { fireEvent: jest.fn().mockResolvedValue(undefined) };
    service = new OpportunitiesService(prisma as unknown as PrismaService, automationEngine as unknown as AutomationEngineService);
  });

  describe('create', () => {
    it('rejeita quando o cliente não existe', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(service.create({ customerId: 'customer-1', title: 'Nova oportunidade' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('usa a primeira etapa do funil quando stageId não é informado', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
      prisma.pipelineStage.findFirst.mockResolvedValue({ id: 'stage-1', order: 1 });
      prisma.opportunity.create.mockResolvedValue({ id: 'opp-1' });

      await service.create({ customerId: 'customer-1', title: 'Nova oportunidade' });

      expect(prisma.pipelineStage.findFirst).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { order: 'asc' } }));
      expect(prisma.opportunity.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ customerId: 'customer-1', stageId: 'stage-1', tags: [] }) }),
      );
    });

    it('rejeita quando o tenant não tem nenhuma etapa de funil configurada', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
      prisma.pipelineStage.findFirst.mockResolvedValue(null);

      await expect(service.create({ customerId: 'customer-1', title: 'Nova oportunidade' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('moveStage', () => {
    it('rejeita quando a etapa de destino não existe', async () => {
      prisma.opportunity.findUnique.mockResolvedValue({ id: 'opp-1' });
      prisma.pipelineStage.findUnique.mockResolvedValue(null);

      await expect(service.moveStage('opp-1', { stageId: 'stage-x' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marca como GANHA e registra wonAt ao mover para uma etapa isWonStage', async () => {
      prisma.opportunity.findUnique.mockResolvedValue({ id: 'opp-1' });
      prisma.pipelineStage.findUnique.mockResolvedValue({ id: 'stage-ganho', isWonStage: true, isLostStage: false });

      await service.moveStage('opp-1', { stageId: 'stage-ganho' });

      expect(prisma.opportunity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'opp-1' },
          data: expect.objectContaining({ stageId: 'stage-ganho', status: 'WON', wonAt: expect.any(Date), lostAt: null }),
        }),
      );
      expect(automationEngine.fireEvent).toHaveBeenCalledWith('OPPORTUNITY_WON', 'OPPORTUNITY', 'opp-1');
    });

    it('marca como PERDIDA ao mover para uma etapa isLostStage', async () => {
      prisma.opportunity.findUnique.mockResolvedValue({ id: 'opp-1' });
      prisma.pipelineStage.findUnique.mockResolvedValue({ id: 'stage-perdido', isWonStage: false, isLostStage: true });

      await service.moveStage('opp-1', { stageId: 'stage-perdido' });

      expect(prisma.opportunity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'LOST', lostAt: expect.any(Date), wonAt: null }),
        }),
      );
      expect(automationEngine.fireEvent).toHaveBeenCalledWith('OPPORTUNITY_LOST', 'OPPORTUNITY', 'opp-1');
    });

    it('volta para OPEN e limpa wonAt/lostAt ao mover para uma etapa intermediária', async () => {
      prisma.opportunity.findUnique.mockResolvedValue({ id: 'opp-1' });
      prisma.pipelineStage.findUnique.mockResolvedValue({ id: 'stage-meio', isWonStage: false, isLostStage: false });

      await service.moveStage('opp-1', { stageId: 'stage-meio' });

      expect(prisma.opportunity.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'OPEN', wonAt: null, lostAt: null }) }),
      );
    });
  });

  describe('markLost', () => {
    it('rejeita quando o tenant não tem etapa de perdido configurada', async () => {
      prisma.opportunity.findUnique.mockResolvedValue({ id: 'opp-1' });
      prisma.pipelineStage.findFirst.mockResolvedValue(null);

      await expect(service.markLost('opp-1', 'preço alto')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('move para a etapa de perdido com o motivo informado', async () => {
      prisma.opportunity.findUnique.mockResolvedValue({ id: 'opp-1' });
      prisma.pipelineStage.findFirst.mockResolvedValue({ id: 'stage-perdido', isLostStage: true });

      await service.markLost('opp-1', 'preço alto');

      expect(prisma.opportunity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ stageId: 'stage-perdido', status: 'LOST', lostReason: 'preço alto' }),
        }),
      );
      expect(automationEngine.fireEvent).toHaveBeenCalledWith('OPPORTUNITY_LOST', 'OPPORTUNITY', 'opp-1');
    });
  });
});
