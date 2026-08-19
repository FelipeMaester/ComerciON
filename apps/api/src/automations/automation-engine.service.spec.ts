import { jobLockAlwaysGrants } from '../common/scheduling/job-lock.test-double';
import { AutomationAction, AutomationEntityType, AutomationTrigger } from '@prisma/client';
import { AutomationEngineService } from './automation-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { TasksService } from '../tasks/tasks.service';
import { WhatsappSenderService } from '../whatsapp/whatsapp-sender.service';

describe('AutomationEngineService', () => {
  let service: AutomationEngineService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let tasksService: { create: jest.Mock };
  let whatsapp: { enviarAutomatico: jest.Mock; prepararParaAprovacao: jest.Mock };

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
    // true = mensagem saiu; false = teto de envio da loja atingido.
    whatsapp = { enviarAutomatico: jest.fn().mockResolvedValue(true), prepararParaAprovacao: jest.fn().mockResolvedValue(undefined) };

    service = new AutomationEngineService(
      prisma as unknown as PrismaService,
      {} as unknown as TenantContextService,
      tasksService as unknown as TasksService,
      whatsapp as unknown as WhatsappSenderService,
      jobLockAlwaysGrants(),
    );
  });

  describe('fireEvent', () => {
    it('executa SEND_WHATSAPP resolvendo o template e grava o log de sucesso', async () => {
      prisma.automationRule.findMany.mockResolvedValue([whatsappRule]);
      prisma.quote.findUnique.mockResolvedValue({ customer: { id: 'cust-1', name: 'João', phone: '11999999999' } });

      await service.fireEvent('SALE_CONFIRMED', AutomationEntityType.QUOTE, 'quote-1');

      expect(whatsapp.enviarAutomatico).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '11999999999', text: 'Olá João, seu orçamento está parado.' }),
      );
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

      expect(whatsapp.enviarAutomatico).not.toHaveBeenCalled();
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
    /**
     * O gatilho preventivo. A janela é o detalhe que importa: começa no
     * início de HOJE, não no instante atual — sem isso a conta que vence
     * hoje ficaria de fora por já ter passado das 00:00, e é justamente ela
     * que mais precisa do lembrete.
     */
    it('a vencer: procura de hoje até daqui a N dias, e só o que está pendente', async () => {
      const regraPreventiva = {
        ...whatsappRule,
        trigger: AutomationTrigger.RECEIVABLE_DUE_IN_DAYS,
        triggerConfig: { days: 3 },
      };
      prisma.automationRule.findMany.mockResolvedValue([regraPreventiva]);
      prisma.financialEntry.findMany.mockResolvedValue([]);

      await service.scanTimeBasedRules();

      const where = prisma.financialEntry.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('PENDING');
      expect(where.dueDate.gte.getHours()).toBe(0);
      expect(where.dueDate.gte.getMinutes()).toBe(0);
      // Três dias exatos de janela, contados a partir do início de hoje.
      const dias = (where.dueDate.lt.getTime() - where.dueDate.gte.getTime()) / (24 * 60 * 60 * 1000);
      expect(dias).toBe(3);
    });

    it('a vencer não repesca o que já venceu — disso cuida o outro gatilho', async () => {
      const regraPreventiva = {
        ...whatsappRule,
        trigger: AutomationTrigger.RECEIVABLE_DUE_IN_DAYS,
        triggerConfig: { days: 3 },
      };
      prisma.automationRule.findMany.mockResolvedValue([regraPreventiva]);
      prisma.financialEntry.findMany.mockResolvedValue([]);

      await service.scanTimeBasedRules();

      const where = prisma.financialEntry.findMany.mock.calls[0][0].where;

      // O piso da janela é o início de hoje: tudo que venceu ontem ou antes
      // fica de fora. Quem já atrasou recebe a cobrança do OUTRO gatilho — se
      // os dois pegassem o mesmo título, o cliente levaria duas mensagens
      // sobre a mesma dívida, uma dizendo "está chegando" e outra "venceu".
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);
      expect(where.dueDate.gte.getTime()).toBeGreaterThan(ontem.getTime());
      expect(where.status).toBe('PENDING');
    });

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
      expect(whatsapp.enviarAutomatico).toHaveBeenCalledTimes(1);
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
      expect(whatsapp.enviarAutomatico).toHaveBeenCalledTimes(1);
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
      expect(whatsapp.enviarAutomatico).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '11988887777', text: expect.stringContaining('Antiga Oficina') }),
      );
    });
  });
});


/**
 * Cobrança que espera autorização, e que diz do que é.
 *
 * "Você tem uma conta em aberto" faz o cliente responder "qual?", e aí alguém
 * da loja vai procurar — a cobrança custa mais trabalho do que economiza. Com
 * o que foi vendido no texto, ele reconhece na hora.
 */
describe('AutomationEngineService — cobrança com aprovação', () => {
  const regraPreparar = {
    id: 'rule-prep',
    tenantId: 'tenant-1',
    name: 'Cobrança com autorização',
    trigger: AutomationTrigger.RECEIVABLE_DUE_IN_DAYS,
    triggerConfig: { days: 3 },
    action: AutomationAction.PREPARE_WHATSAPP,
    actionConfig: {
      messageTemplate: 'Olá, {{customerName}}! Sobre {{itens}} — {{valor}} em aberto.',
    },
    isActive: true,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function montar(entry: any) {
    const prisma = {
      automationRule: { findMany: jest.fn().mockResolvedValue([regraPreparar]) },
      automationRunLog: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
      financialEntry: {
        findMany: jest.fn().mockResolvedValue([{ id: 'entry-1' }]),
        findUnique: jest.fn().mockResolvedValue(entry),
      },
      quote: { findMany: jest.fn().mockResolvedValue([]) },
      opportunity: { findMany: jest.fn().mockResolvedValue([]) },
      sale: { groupBy: jest.fn().mockResolvedValue([]) },
      customer: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      serviceOrder: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const whatsapp = { enviarAutomatico: jest.fn(), prepararParaAprovacao: jest.fn().mockResolvedValue(undefined) };
    const service = new AutomationEngineService(
      prisma as unknown as PrismaService,
      {} as unknown as TenantContextService,
      { create: jest.fn() } as unknown as TasksService,
      whatsapp as unknown as WhatsappSenderService,
      jobLockAlwaysGrants(),
    );
    return { service, whatsapp };
  }

  it('prepara em vez de enviar — nada sai sem alguém aprovar', async () => {
    const { service, whatsapp } = montar({
      amount: 300,
      description: 'Venda abc — fiado',
      customer: { id: 'cli-1', name: 'João', phone: '5514999990000' },
      sale: { items: [{ quantity: 1, description: null, product: { name: 'Bateria 60Ah' } }] },
    });

    await service.scanTimeBasedRules();

    expect(whatsapp.enviarAutomatico).not.toHaveBeenCalled();
    expect(whatsapp.prepararParaAprovacao).toHaveBeenCalledTimes(1);
  });

  it('a mensagem diz o que foi vendido e quanto', async () => {
    const { service, whatsapp } = montar({
      amount: 300,
      description: 'Venda abc — fiado',
      customer: { id: 'cli-1', name: 'João', phone: '5514999990000' },
      sale: {
        items: [
          { quantity: 2, description: null, product: { name: 'Pastilha de freio' } },
          { quantity: 1, description: 'Mão de obra', product: null },
        ],
      },
    });

    await service.scanTimeBasedRules();

    const { text } = whatsapp.prepararParaAprovacao.mock.calls[0][0];
    expect(text).toContain('João');
    // Quantidade só aparece quando é mais de um: "1x Mão de obra" é ruído.
    expect(text).toContain('2x Pastilha de freio, Mão de obra');
    expect(text).toContain('R$');
    expect(text).toContain('300,00');
  });

  it('lançamento avulso, sem venda, usa a própria descrição', async () => {
    const { service, whatsapp } = montar({
      amount: 150,
      description: 'Conserto do portão',
      customer: { id: 'cli-1', name: 'Maria', phone: '5514999990000' },
      sale: null,
    });

    await service.scanTimeBasedRules();

    const { text } = whatsapp.prepararParaAprovacao.mock.calls[0][0];
    expect(text).toContain('Conserto do portão');
  });
});
