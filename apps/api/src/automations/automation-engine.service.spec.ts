import { AutomationAction, AutomationEntityType, AutomationTrigger } from '@prisma/client';
import { AutomationEngineService } from './automation-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { TasksService } from '../tasks/tasks.service';
import { WhatsAppProvider } from '../whatsapp/whatsapp-provider.interface';

describe('AutomationEngineService', () => {
  let service: AutomationEngineService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let tasksService: { create: jest.Mock };
  let whatsapp: { sendText: jest.Mock };

  const whatsappRule = {
    id: 'rule-whatsapp',
    tenantId: 'tenant-1',
    name: 'Cobrar orçamento parado',
    trigger: AutomationTrigger.QUOTE_PENDING_DAYS,
    triggerConfig: { days: 3 },
    action: AutomationAction.SEND_WHATSAPP,
    actionConfig: { messageTemplate: 'Olá {{customerName}}, seu orçamento está parado.' },
    isActive: true,
  };

  const taskRule = {
    id: 'rule-task',
    tenantId: 'tenant-1',
    name: 'Follow-up pós-venda',
    trigger: AutomationTrigger.SALE_CONFIRMED,
    triggerConfig: null,
    action: AutomationAction.CREATE_TASK,
    actionConfig: { titleTemplate: 'Ligar para {{customerName}}', assignToId: 'user-1' },
    isActive: true,
  };

  beforeEach(() => {
    prisma = {
      automationRule: { findMany: jest.fn() },
      automationRunLog: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
      quote: { findMany: jest.fn(), findUnique: jest.fn() },
      opportunity: { findMany: jest.fn(), findUnique: jest.fn() },
      sale: { findUnique: jest.fn() },
    };
    tasksService = { create: jest.fn().mockResolvedValue({ id: 'task-1' }) };
    whatsapp = { sendText: jest.fn().mockResolvedValue({ externalId: 'ext-1' }) };

    service = new AutomationEngineService(
      prisma as unknown as PrismaService,
      {} as unknown as TenantContextService,
      tasksService as unknown as TasksService,
      whatsapp as unknown as WhatsAppProvider,
    );
  });

  describe('fireEvent', () => {
    it('executa SEND_WHATSAPP resolvendo o template e grava o log de sucesso', async () => {
      prisma.automationRule.findMany.mockResolvedValue([whatsappRule]);
      prisma.quote.findUnique.mockResolvedValue({ customer: { id: 'cust-1', name: 'João', phone: '11999999999' } });

      await service.fireEvent('SALE_CONFIRMED', AutomationEntityType.QUOTE, 'quote-1');

      expect(whatsapp.sendText).toHaveBeenCalledWith('11999999999', 'Olá João, seu orçamento está parado.');
      expect(prisma.automationRunLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ruleId: 'rule-whatsapp', success: true }) }),
      );
    });

    it('executa CREATE_TASK chamando TasksService.create com o assignToId da regra', async () => {
      prisma.automationRule.findMany.mockResolvedValue([taskRule]);
      prisma.sale.findUnique.mockResolvedValue({ customer: { id: 'cust-1', name: 'Oficina Central', phone: '1133334444' } });

      await service.fireEvent('SALE_CONFIRMED', AutomationEntityType.SALE, 'sale-1');

      expect(tasksService.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Ligar para Oficina Central', customerId: 'cust-1' }),
        'user-1',
      );
    });

    it('nunca propaga erro de ação — grava o log como falha e segue', async () => {
      prisma.automationRule.findMany.mockResolvedValue([whatsappRule]);
      prisma.quote.findUnique.mockResolvedValue({ customer: { id: 'cust-1', name: 'João', phone: null } });

      await expect(service.fireEvent('SALE_CONFIRMED', AutomationEntityType.QUOTE, 'quote-1')).resolves.toBeUndefined();

      expect(whatsapp.sendText).not.toHaveBeenCalled();
      expect(prisma.automationRunLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ success: false, error: expect.any(String) }) }),
      );
    });

    it('só busca regras ativas do gatilho correspondente', async () => {
      prisma.automationRule.findMany.mockResolvedValue([]);
      await service.fireEvent('OPPORTUNITY_WON', AutomationEntityType.OPPORTUNITY, 'opp-1');
      expect(prisma.automationRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { trigger: AutomationTrigger.OPPORTUNITY_WON, isActive: true } }),
      );
    });
  });

  describe('scanTimeBasedRules', () => {
    it('dispara a ação só para registros ainda não logados pela regra (idempotência)', async () => {
      prisma.automationRule.findMany.mockResolvedValue([whatsappRule]);
      prisma.automationRunLog.findMany.mockResolvedValue([{ entityId: 'quote-already-fired' }]);
      prisma.quote.findMany.mockResolvedValue([{ id: 'quote-new' }]);
      prisma.quote.findUnique.mockResolvedValue({ customer: { id: 'cust-1', name: 'João', phone: '11999999999' } });

      await service.scanTimeBasedRules();

      expect(prisma.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { notIn: ['quote-already-fired'] } }) }),
      );
      expect(whatsapp.sendText).toHaveBeenCalledTimes(1);
    });
  });
});
