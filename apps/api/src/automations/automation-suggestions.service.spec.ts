import { AutomationSuggestionStatus } from '@prisma/client';
import { AutomationSuggestionsService } from './automation-suggestions.service';
import { AutomationRulesService } from './automation-rules.service';
import { BusinessSnapshot, BusinessSnapshotService } from './business-snapshot.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeneratedSuggestion, SuggestionGenerator } from './suggestions/suggestion-generator.interface';

const USER_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

const goodSuggestion: GeneratedSuggestion = {
  name: 'Cobrar orçamento parado',
  rationale: '12 orçamentos parados há mais de 3 dias, somando R$ 8.400',
  trigger: 'QUOTE_PENDING_DAYS',
  triggerConfig: { days: 3 },
  action: 'SEND_WHATSAPP',
  actionConfig: { messageTemplate: 'Olá {{customerName}}, seu orçamento ainda está disponível.' },
};

function snapshot(overrides: Partial<BusinessSnapshot> = {}): BusinessSnapshot {
  return {
    signals: {
      pendingQuotesOver3Days: 12,
      pendingQuotesValue: 8400,
      staleOpportunitiesOver7Days: 0,
      overdueReceivables: 0,
      overdueReceivablesValue: 0,
      staleServiceOrdersOver5Days: 0,
      lowStockProducts: 0,
      inactiveCustomers90Days: 0,
      activeCustomers: 50,
      customersWithPhone: 50,
    },
    users: [{ id: USER_ID, name: 'Admin', role: 'ADMIN' }],
    existingRules: [],
    dismissed: [],
    hasAnySignal: true,
    ...overrides,
  };
}

describe('AutomationSuggestionsService', () => {
  let service: AutomationSuggestionsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let generator: { generate: jest.Mock };
  let rulesService: { create: jest.Mock };
  let snapshotService: { build: jest.Mock };

  beforeEach(() => {
    prisma = {
      automationSuggestion: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    generator = { generate: jest.fn().mockResolvedValue([]) };
    rulesService = { create: jest.fn().mockResolvedValue({ id: 'rule-nova' }) };
    snapshotService = { build: jest.fn().mockResolvedValue(snapshot()) };

    service = new AutomationSuggestionsService(
      prisma as unknown as PrismaService,
      rulesService as unknown as AutomationRulesService,
      snapshotService as unknown as BusinessSnapshotService,
      generator as unknown as SuggestionGenerator,
    );
  });

  describe('list', () => {
    it('lê só o cache — nunca aciona o gerador', async () => {
      prisma.automationSuggestion.findMany.mockResolvedValue([{ id: 's1', generatedAt: new Date() }]);

      const result = await service.list();

      expect(generator.generate).not.toHaveBeenCalled();
      expect(result.suggestions).toHaveLength(1);
      expect(result.isStale).toBe(false);
    });

    it('marca como vencido quando a última análise passou de uma semana', async () => {
      const oitoDiasAtras = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      prisma.automationSuggestion.findMany.mockResolvedValue([{ id: 's1', generatedAt: oitoDiasAtras }]);

      expect((await service.list()).isStale).toBe(true);
    });

    it('marca como vencido quando nunca foi analisado', async () => {
      expect((await service.list()).isStale).toBe(true);
    });
  });

  describe('refresh', () => {
    it('nem aciona o gerador quando não há nenhum sinal no negócio', async () => {
      snapshotService.build.mockResolvedValue(snapshot({ hasAnySignal: false }));

      const result = await service.refresh();

      expect(generator.generate).not.toHaveBeenCalled();
      expect(result.skipped).toBeDefined();
    });

    it('grava as sugestões válidas devolvidas pelo gerador', async () => {
      generator.generate.mockResolvedValue([goodSuggestion]);

      await service.refresh();

      expect(prisma.automationSuggestion.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({ name: 'Cobrar orçamento parado', trigger: 'QUOTE_PENDING_DAYS' })],
        }),
      );
    });

    it('limita a 6 sugestões por rodada', async () => {
      generator.generate.mockResolvedValue(
        Array.from({ length: 12 }, (_, i) => ({ ...goodSuggestion, name: `Regra ${i}` })),
      );

      await service.refresh();

      expect(prisma.automationSuggestion.createMany.mock.calls[0][0].data).toHaveLength(6);
    });

    describe('descarta sugestão inválida, venha de onde vier', () => {
      // A validação é única e vale para os dois motores: uma heurística nova
      // com bug é barrada aqui exatamente como uma alucinação da IA seria.
      const cases: Array<[string, GeneratedSuggestion]> = [
        ['gatilho que não existe', { ...goodSuggestion, trigger: 'GATILHO_INVENTADO' as never }],
        ['ação que não existe', { ...goodSuggestion, action: 'MANDAR_EMAIL' as never }],
        ['gatilho de tempo sem days', { ...goodSuggestion, triggerConfig: {} }],
        ['days igual a zero', { ...goodSuggestion, triggerConfig: { days: 0 } }],
        ['WhatsApp sem messageTemplate', { ...goodSuggestion, actionConfig: {} }],
        [
          'estoque baixo com WhatsApp (gatilho sem cliente)',
          { ...goodSuggestion, trigger: 'LOW_STOCK', triggerConfig: null },
        ],
        [
          'tarefa atribuída a usuário inexistente',
          {
            ...goodSuggestion,
            action: 'CREATE_TASK',
            actionConfig: { titleTemplate: 'Ligar', assignToId: '00000000-0000-0000-0000-000000000000' },
          },
        ],
        ['sem justificativa', { ...goodSuggestion, rationale: '' }],
      ];

      it.each(cases)('%s', async (_label, bad) => {
        generator.generate.mockResolvedValue([bad]);

        await service.refresh();

        expect(prisma.automationSuggestion.createMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('accept', () => {
    it('cria a regra pelo mesmo validador do cadastro manual e marca como aceita', async () => {
      prisma.automationSuggestion.findUnique.mockResolvedValue({
        id: 's1',
        status: AutomationSuggestionStatus.PENDING,
        ...goodSuggestion,
      });

      await service.accept('s1');

      expect(rulesService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Cobrar orçamento parado', isActive: true }),
      );
      expect(prisma.automationSuggestion.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: AutomationSuggestionStatus.ACCEPTED, createdRuleId: 'rule-nova' },
      });
    });

    it('recusa aceitar duas vezes', async () => {
      prisma.automationSuggestion.findUnique.mockResolvedValue({
        id: 's1',
        status: AutomationSuggestionStatus.ACCEPTED,
        ...goodSuggestion,
      });

      await expect(service.accept('s1')).rejects.toThrow(/já foi aceita ou descartada/);
    });
  });
});
