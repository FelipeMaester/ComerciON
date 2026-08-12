import { jobLockAlwaysGrants } from '../common/scheduling/job-lock.test-double';
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
      quote: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      opportunity: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      sale: { findUnique: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
      customer: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      financialEntry: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      serviceOrder: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    };
    tasksService = { create: jest.fn().mockResolvedValue({ id: 'task-1' }) };
    whatsapp = { sendText: jest.fn().mockResolvedValue({ externalId: 'ext-1' }) };

    service = new AutomationEngineService(
      prisma as unknown as PrismaService,
      {} as unknown as TenantContextService,
      tasksService as unknown as TasksService,
      whatsapp as unknown as WhatsAppProvider,
      jobLockAlwaysGrants(),
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
    it('pula os registros que a regra já disparou e age só nos demais', async () => {
      prisma.automationRule.findMany.mockResolvedValue([whatsappRule]);
      prisma.quote.findMany.mockResolvedValue([{ id: 'quote-ja-disparado' }, { id: 'quote-novo' }]);
      prisma.automationRunLog.findMany.mockResolvedValue([{ entityId: 'quote-ja-disparado' }]);
      prisma.quote.findUnique.mockResolvedValue({ customer: { id: 'cust-1', name: 'João', phone: '11999999999' } });

      await service.scanTimeBasedRules();

      // A exclusão deixou de ser um NOT IN com todo o histórico da regra: a
      // consulta agora parte dos candidatos e pergunta quais deles já
      // dispararam, usando o índice [ruleId, entityType, entityId, firedAt].
      expect(prisma.automationRunLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ruleId: 'rule-whatsapp',
            entityType: AutomationEntityType.QUOTE,
            entityId: { in: ['quote-ja-disparado', 'quote-novo'] },
          }),
        }),
      );
      expect(whatsapp.sendText).toHaveBeenCalledTimes(1);
      expect(prisma.quote.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'quote-novo' } }));
    });

    it('sem cooldown, qualquer disparo anterior bloqueia para sempre (padrão seguro)', async () => {
      prisma.automationRule.findMany.mockResolvedValue([{ ...whatsappRule, cooldownDays: null }]);
      prisma.quote.findMany.mockResolvedValue([{ id: 'quote-1' }]);
      prisma.automationRunLog.findMany.mockResolvedValue([]);
      prisma.quote.findUnique.mockResolvedValue({ customer: { id: 'c', name: 'João', phone: '11999999999' } });

      await service.scanTimeBasedRules();

      // Sem filtro de data: qualquer log da regra naquele registro conta.
      const call = prisma.automationRunLog.findMany.mock.calls[0][0];
      expect(call.where.firedAt).toBeUndefined();
    });

    it('com cooldown, só os disparos dentro da janela bloqueiam — é o que permite recobrar', async () => {
      prisma.automationRule.findMany.mockResolvedValue([{ ...whatsappRule, cooldownDays: 7 }]);
      prisma.quote.findMany.mockResolvedValue([{ id: 'quote-1' }]);
      prisma.automationRunLog.findMany.mockResolvedValue([]);
      prisma.quote.findUnique.mockResolvedValue({ customer: { id: 'c', name: 'João', phone: '11999999999' } });

      await service.scanTimeBasedRules();

      const call = prisma.automationRunLog.findMany.mock.calls[0][0];
      const cutoff: Date = call.where.firedAt.gte;
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      expect(Math.abs(cutoff.getTime() - sevenDaysAgo)).toBeLessThan(5000);
      // Log fora da janela não bloqueia: a regra dispara de novo.
      expect(whatsapp.sendText).toHaveBeenCalledTimes(1);
    });

    it('limita quantos registros uma regra dispara por varredura (freio de custo)', async () => {
      prisma.automationRule.findMany.mockResolvedValue([whatsappRule]);
      prisma.quote.findMany.mockResolvedValue([]);

      await service.scanTimeBasedRules();

      // Sem teto, ativar uma regra numa base grande dispararia dezenas de
      // milhares de conversas cobradas de uma vez, na primeira madrugada.
      expect(prisma.quote.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
    });

    it('estoque baixo compara a soma de todos os depósitos com o mínimo do produto', async () => {
      prisma.automationRule.findMany.mockResolvedValue([
        {
          ...whatsappRule,
          id: 'rule-estoque',
          trigger: AutomationTrigger.LOW_STOCK,
          triggerConfig: null,
          action: AutomationAction.CREATE_TASK,
          actionConfig: { titleTemplate: 'Repor peça', assignToId: 'user-1' },
        },
      ]);
      prisma.product.findMany.mockResolvedValue([
        // 2 + 1 = 3, abaixo do mínimo 5 → dispara
        { id: 'prod-baixo', minStock: 5, stockItems: [{ quantity: 2 }, { quantity: 1 }] },
        // 4 + 4 = 8, acima do mínimo 5 → não dispara
        { id: 'prod-ok', minStock: 5, stockItems: [{ quantity: 4 }, { quantity: 4 }] },
      ]);
      prisma.automationRunLog.findMany.mockResolvedValue([]);

      await service.scanTimeBasedRules();

      expect(tasksService.create).toHaveBeenCalledTimes(1);
      // Produto não tem cliente: a tarefa nasce sem customerId, sem quebrar.
      expect(tasksService.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Repor peça', customerId: undefined }),
        'user-1',
      );
    });

    it('cliente inativo ignora quem nunca comprou — só quem parou de comprar', async () => {
      prisma.automationRule.findMany.mockResolvedValue([
        {
          ...whatsappRule,
          id: 'rule-inativo',
          trigger: AutomationTrigger.CUSTOMER_INACTIVE_DAYS,
          triggerConfig: { days: 90 },
        },
      ]);
      prisma.sale.groupBy.mockResolvedValue([
        { customerId: 'cust-sumido', _max: { confirmedAt: new Date('2020-01-01') } },
        { customerId: 'cust-recente', _max: { confirmedAt: new Date() } },
      ]);
      prisma.customer.findMany.mockResolvedValue([{ id: 'cust-sumido' }]);
      prisma.automationRunLog.findMany.mockResolvedValue([]);
      prisma.customer.findUnique.mockResolvedValue({ id: 'cust-sumido', name: 'Antiga Oficina', phone: '11988887777' });

      await service.scanTimeBasedRules();

      // Quem nunca comprou não aparece no groupBy de vendas, então nem entra
      // na consulta — é lead, não cliente inativo.
      expect(prisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { in: ['cust-sumido'] }, isActive: true }) }),
      );
      expect(whatsapp.sendText).toHaveBeenCalledWith('11988887777', expect.stringContaining('Antiga Oficina'));
    });
  });
});
