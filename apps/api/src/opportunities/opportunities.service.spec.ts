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

  describe('findAll (quadro do funil)', () => {
    /**
     * Um funil saudável tem poucas oportunidades abertas, mas as etapas
     * terminais nunca esvaziam: nada sai de "Ganho" nem de "Perdido".
     *
     * Medido com dois anos de funil (1.200 oportunidades): 966 KB de resposta,
     * 75% dela de negócios já fechados, e uma página de 61.698 pixels — 68
     * telas de rolagem, porque a coluna "Ganho" empilhava 480 cartões.
     */
    beforeEach(() => {
      prisma.opportunity.groupBy = jest.fn().mockResolvedValue([
        { stageId: 'aberta', _count: { _all: 60 }, _sum: { estimatedValue: 48600 } },
        { stageId: 'ganho', _count: { _all: 480 }, _sum: { estimatedValue: 512000 } },
      ]);
      prisma.opportunity.findMany.mockResolvedValue([]);
    });

    it('pede no máximo 25 cartões por etapa, e não a tabela inteira', async () => {
      await service.findAll();

      // Uma consulta por etapa, cada uma limitada.
      expect(prisma.opportunity.findMany).toHaveBeenCalledTimes(2);
      for (const [args] of prisma.opportunity.findMany.mock.calls) {
        expect(args.take).toBe(25);
      }
    });

    it('o resumo traz o número da LOJA, não o do que coube na tela', async () => {
      const quadro = await service.findAll();

      // É este número que aparece no cabeçalho da coluna. Sem ele, "Ganho"
      // diria 25 onde a loja tem 480 — a tela pesada viraria a tela mentirosa.
      expect(quadro.resumo).toEqual([
        { stageId: 'aberta', total: 60, valor: 48600 },
        { stageId: 'ganho', total: 480, valor: 512000 },
      ]);
    });

    it('a mais recente vem primeiro: o quadro é para trabalhar, não para arquivar', async () => {
      await service.findAll();

      const [args] = prisma.opportunity.findMany.mock.calls[0];
      expect(args.orderBy).toEqual({ stageChangedAt: 'desc' });
    });

    it('etapa sem oportunidade não gera consulta', async () => {
      // Controle: o groupBy só devolve etapas que TÊM oportunidade, então uma
      // coluna vazia não custa uma ida ao banco. Sem isto, um funil com vinte
      // etapas cobraria vinte consultas para desenhar dezoito colunas vazias.
      prisma.opportunity.groupBy.mockResolvedValue([]);

      const quadro = await service.findAll();

      expect(prisma.opportunity.findMany).not.toHaveBeenCalled();
      expect(quadro.items).toEqual([]);
      expect(quadro.resumo).toEqual([]);
    });
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
