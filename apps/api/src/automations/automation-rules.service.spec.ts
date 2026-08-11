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
      automationRule: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      automationRunLog: { findMany: jest.fn() },
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
