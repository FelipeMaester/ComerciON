import { BadRequestException } from '@nestjs/common';
import { AutomationAction, AutomationTrigger } from '@prisma/client';
import { AutomationRulesService } from './automation-rules.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AutomationRulesService', () => {
  let service: AutomationRulesService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const validUserId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

  beforeEach(() => {
    prisma = {
      automationRule: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      automationRunLog: { findMany: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn() },
    };
    service = new AutomationRulesService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('rejeita gatilho baseado em tempo sem "days"', async () => {
      await expect(
        service.create({
          name: 'Regra',
          trigger: AutomationTrigger.QUOTE_PENDING_DAYS,
          triggerConfig: {},
          action: AutomationAction.SEND_WHATSAPP,
          actionConfig: { messageTemplate: 'Olá {{customerName}}' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita "days" não positivo', async () => {
      await expect(
        service.create({
          name: 'Regra',
          trigger: AutomationTrigger.OPPORTUNITY_STALE_DAYS,
          triggerConfig: { days: 0 },
          action: AutomationAction.SEND_WHATSAPP,
          actionConfig: { messageTemplate: 'Olá' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita SEND_WHATSAPP sem messageTemplate', async () => {
      await expect(
        service.create({
          name: 'Regra',
          trigger: AutomationTrigger.SALE_CONFIRMED,
          action: AutomationAction.SEND_WHATSAPP,
          actionConfig: {},
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita CREATE_TASK sem titleTemplate', async () => {
      await expect(
        service.create({
          name: 'Regra',
          trigger: AutomationTrigger.SALE_CONFIRMED,
          action: AutomationAction.CREATE_TASK,
          actionConfig: { assignToId: validUserId },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita CREATE_TASK com assignToId que não é UUID', async () => {
      await expect(
        service.create({
          name: 'Regra',
          trigger: AutomationTrigger.SALE_CONFIRMED,
          action: AutomationAction.CREATE_TASK,
          actionConfig: { titleTemplate: 'Ligar', assignToId: 'nao-e-uuid' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita CREATE_TASK quando o usuário responsável não existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.create({
          name: 'Regra',
          trigger: AutomationTrigger.SALE_CONFIRMED,
          action: AutomationAction.CREATE_TASK,
          actionConfig: { titleTemplate: 'Ligar', assignToId: validUserId },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cria a regra quando a configuração é válida', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: validUserId });
      prisma.automationRule.create.mockResolvedValue({ id: 'rule-1' });

      await service.create({
        name: 'Follow-up pós-venda',
        trigger: AutomationTrigger.SALE_CONFIRMED,
        action: AutomationAction.CREATE_TASK,
        actionConfig: { titleTemplate: 'Ligar para {{customerName}}', assignToId: validUserId },
      });

      expect(prisma.automationRule.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Follow-up pós-venda', isActive: true }) }),
      );
    });
  });

  describe('combinações impossíveis', () => {
    it('rejeita estoque baixo + enviar WhatsApp (o gatilho não tem cliente)', async () => {
      // Barrado no cadastro em vez de virar uma regra que só falha às 10h da
      // manhã seguinte, com "Cliente sem telefone" num log que ninguém lê.
      await expect(
        service.create({
          name: 'Avisar cliente do estoque',
          trigger: AutomationTrigger.LOW_STOCK,
          action: AutomationAction.SEND_WHATSAPP,
          actionConfig: { messageTemplate: 'Acabou a peça' },
        }),
      ).rejects.toThrow(/não tem um cliente associado/);
    });

    it('aceita estoque baixo + criar tarefa', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: validUserId });
      prisma.automationRule.create.mockResolvedValue({ id: 'rule-1' });

      await expect(
        service.create({
          name: 'Repor estoque',
          trigger: AutomationTrigger.LOW_STOCK,
          action: AutomationAction.CREATE_TASK,
          actionConfig: { titleTemplate: 'Comprar peça', assignToId: validUserId },
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('findAll', () => {
    it('embute contagem de disparos, falhas e última execução em duas agregações', async () => {
      prisma.automationRule.findMany.mockResolvedValue([{ id: 'rule-1' }, { id: 'rule-2' }]);
      const lastFired = new Date('2026-08-10T12:00:00Z');
      prisma.automationRunLog.groupBy
        .mockResolvedValueOnce([{ ruleId: 'rule-1', _count: 12, _max: { firedAt: lastFired } }])
        .mockResolvedValueOnce([{ ruleId: 'rule-1', _count: 3 }]);

      const result = await service.findAll();

      expect(result[0].stats).toEqual({ runCount: 12, failureCount: 3, lastFiredAt: lastFired });
      // Regra que nunca disparou não some da lista nem vira undefined.
      expect(result[1].stats).toEqual({ runCount: 0, failureCount: 0, lastFiredAt: null });
      // Duas consultas no total, não uma por regra (N+1).
      expect(prisma.automationRunLog.groupBy).toHaveBeenCalledTimes(2);
    });
  });

  describe('remove', () => {
    it('exclui a regra depois de confirmar que ela existe', async () => {
      prisma.automationRule.findUnique.mockResolvedValue({ id: 'rule-1' });
      prisma.automationRule.delete.mockResolvedValue({ id: 'rule-1' });

      await expect(service.remove('rule-1')).resolves.toEqual({ id: 'rule-1', deleted: true });
      expect(prisma.automationRule.delete).toHaveBeenCalledWith({ where: { id: 'rule-1' } });
    });
  });

  describe('update', () => {
    it('revalida a configuração mesclando com a regra existente', async () => {
      prisma.automationRule.findUnique.mockResolvedValue({
        id: 'rule-1',
        trigger: AutomationTrigger.QUOTE_PENDING_DAYS,
        triggerConfig: { days: 3 },
        action: AutomationAction.SEND_WHATSAPP,
        actionConfig: { messageTemplate: 'Olá' },
      });
      prisma.automationRule.update.mockResolvedValue({ id: 'rule-1', isActive: false });

      await service.update('rule-1', { isActive: false });

      expect(prisma.automationRule.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rule-1' }, data: expect.objectContaining({ isActive: false }) }),
      );
    });
  });
});
