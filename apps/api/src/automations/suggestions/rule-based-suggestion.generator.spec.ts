import { AutomationAction, AutomationTrigger } from '@prisma/client';
import { RuleBasedSuggestionGenerator } from './rule-based-suggestion.generator';
import { BusinessSignals, BusinessSnapshot } from '../business-snapshot.service';
import { ACTION_CATALOG, TRIGGERS_REQUIRING_DAYS, TRIGGER_CATALOG } from '../automation-catalog';

const ADMIN = { id: 'user-admin', name: 'Admin', role: 'ADMIN' as const };

const ZERO: BusinessSignals = {
  pendingQuotesOver3Days: 0,
  pendingQuotesValue: 0,
  staleOpportunitiesOver7Days: 0,
  overdueReceivables: 0,
  overdueReceivablesValue: 0,
  receivablesDueSoon: 0,
  receivablesDueSoonValue: 0,
  staleServiceOrdersOver5Days: 0,
  lowStockProducts: 0,
  inactiveCustomers90Days: 0,
  activeCustomers: 0,
  customersWithPhone: 0,
};

function snap(signals: Partial<BusinessSignals>, overrides: Partial<BusinessSnapshot> = {}): BusinessSnapshot {
  return {
    signals: { ...ZERO, ...signals },
    users: [ADMIN],
    existingRules: [],
    dismissed: [],
    hasAnySignal: true,
    ...overrides,
  };
}

describe('RuleBasedSuggestionGenerator', () => {
  const generator = new RuleBasedSuggestionGenerator();

  it('não sugere nada quando não há sinal nenhum', async () => {
    expect(await generator.generate(snap({}))).toEqual([]);
  });

  it('só sugere o que os números justificam', async () => {
    // Uma única conta vencida é caso isolado, não padrão que mereça automação.
    expect(await generator.generate(snap({ overdueReceivables: 1 }))).toHaveLength(0);

    const result = await generator.generate(
      snap({ overdueReceivables: 6, overdueReceivablesValue: 741.24, activeCustomers: 50, customersWithPhone: 50 }),
    );
    expect(result.some((s) => s.trigger === AutomationTrigger.RECEIVABLE_OVERDUE_DAYS)).toBe(true);
  });

  it('cita o número real na justificativa — é o que faz o usuário decidir', async () => {
    const [suggestion] = await generator.generate(
      snap({ overdueReceivables: 6, overdueReceivablesValue: 741.24, activeCustomers: 50, customersWithPhone: 50 }),
    );

    expect(suggestion.rationale).toContain('6');
    // Formatado em real brasileiro, não como número cru.
    expect(suggestion.rationale).toMatch(/R\$\s?741,24/);
  });

  it('usa criar tarefa quando o gatilho não tem cliente (estoque baixo)', async () => {
    const [suggestion] = await generator.generate(snap({ lowStockProducts: 4 }));

    expect(suggestion.trigger).toBe(AutomationTrigger.LOW_STOCK);
    expect(suggestion.action).toBe(AutomationAction.CREATE_TASK);
  });

  it('troca WhatsApp por tarefa quando poucos clientes têm telefone', async () => {
    // Com 10 de 100 clientes com telefone, 90% dos envios falhariam.
    const [suggestion] = await generator.generate(
      snap({ overdueReceivables: 6, overdueReceivablesValue: 500, activeCustomers: 100, customersWithPhone: 10 }),
    );

    expect(suggestion.action).toBe(AutomationAction.CREATE_TASK);
  });

  it('usa WhatsApp quando a base tem telefone o bastante', async () => {
    const [suggestion] = await generator.generate(
      snap({ overdueReceivables: 6, overdueReceivablesValue: 500, activeCustomers: 100, customersWithPhone: 90 }),
    );

    expect(suggestion.action).toBe(AutomationAction.SEND_WHATSAPP);
  });

  it('não repete automação que já existe', async () => {
    const signals = { overdueReceivables: 6, overdueReceivablesValue: 500, activeCustomers: 50, customersWithPhone: 50 };

    const semRegra = await generator.generate(snap(signals));
    const comRegra = await generator.generate(
      snap(signals, {
        existingRules: [
          {
            name: 'Já tenho essa',
            trigger: AutomationTrigger.RECEIVABLE_OVERDUE_DAYS,
            action: AutomationAction.SEND_WHATSAPP,
            isActive: true,
          },
        ],
      }),
    );

    expect(semRegra.some((s) => s.trigger === AutomationTrigger.RECEIVABLE_OVERDUE_DAYS)).toBe(true);
    expect(comRegra.some((s) => s.trigger === AutomationTrigger.RECEIVABLE_OVERDUE_DAYS)).toBe(false);
  });

  it('não ressuscita sugestão que o usuário já recusou', async () => {
    const result = await generator.generate(
      snap(
        { lowStockProducts: 4 },
        { dismissed: [{ trigger: AutomationTrigger.LOW_STOCK, action: AutomationAction.CREATE_TASK }] },
      ),
    );

    expect(result.some((s) => s.trigger === AutomationTrigger.LOW_STOCK)).toBe(false);
  });

  it('põe dinheiro vencido acima do resto', async () => {
    const result = await generator.generate(
      snap({
        overdueReceivables: 6,
        overdueReceivablesValue: 741.24,
        pendingQuotesOver3Days: 5,
        pendingQuotesValue: 100,
        lowStockProducts: 4,
        activeCustomers: 50,
        customersWithPhone: 50,
      }),
    );

    // Cobrar o que já venceu vem antes de retomar orçamento e de repor estoque.
    expect(result[0].trigger).toBe(AutomationTrigger.RECEIVABLE_OVERDUE_DAYS);
  });

  it('não passa de 6 sugestões', async () => {
    const result = await generator.generate(
      snap({
        overdueReceivables: 10,
        overdueReceivablesValue: 5000,
        pendingQuotesOver3Days: 10,
        pendingQuotesValue: 9000,
        staleOpportunitiesOver7Days: 10,
        staleServiceOrdersOver5Days: 10,
        lowStockProducts: 10,
        inactiveCustomers90Days: 10,
        activeCustomers: 100,
        customersWithPhone: 100,
      }),
    );

    expect(result.length).toBeLessThanOrEqual(6);
  });

  it('não sugere nada se não houver usuário para atribuir tarefa', async () => {
    // Sem responsável, toda sugestão de CREATE_TASK nasceria inválida.
    expect(await generator.generate(snap({ lowStockProducts: 4 }, { users: [] }))).toEqual([]);
  });

  it('toda sugestão gerada respeita as invariantes do catálogo', async () => {
    // Este é o teste que protege o motor inteiro: qualquer heurística nova
    // que produza uma combinação inválida é pega aqui, e não em produção.
    const result = await generator.generate(
      snap({
        overdueReceivables: 10,
        overdueReceivablesValue: 5000,
        pendingQuotesOver3Days: 10,
        pendingQuotesValue: 9000,
        staleOpportunitiesOver7Days: 10,
        staleServiceOrdersOver5Days: 10,
        lowStockProducts: 10,
        inactiveCustomers90Days: 10,
        activeCustomers: 100,
        customersWithPhone: 100,
      }),
    );

    expect(result.length).toBeGreaterThan(0);
    for (const s of result) {
      expect(TRIGGER_CATALOG[s.trigger]).toBeDefined();
      expect(ACTION_CATALOG[s.action]).toBeDefined();

      // Nunca fala com o cliente num gatilho que não tem cliente.
      if (ACTION_CATALOG[s.action].contactsCustomer) {
        expect(TRIGGER_CATALOG[s.trigger].hasCustomer).toBe(true);
      }

      // Gatilho de janela sempre traz days inteiro positivo.
      if (TRIGGERS_REQUIRING_DAYS.has(s.trigger)) {
        const days = (s.triggerConfig as { days?: number } | null)?.days;
        expect(Number.isInteger(days)).toBe(true);
        expect(days as number).toBeGreaterThan(0);
      }

      // Todo campo obrigatório da ação vem preenchido.
      for (const field of ACTION_CATALOG[s.action].fields) {
        if (!field.required) continue;
        expect(typeof s.actionConfig[field.key]).toBe('string');
        expect((s.actionConfig[field.key] as string).length).toBeGreaterThan(0);
      }

      // Tarefa sempre aponta pra um usuário que existe no retrato.
      if (s.action === AutomationAction.CREATE_TASK) {
        expect(s.actionConfig.assignToId).toBe(ADMIN.id);
      }
    }
  });

  it('mensagens de WhatsApp usam o marcador de nome do cliente', async () => {
    const result = await generator.generate(
      snap({
        overdueReceivables: 6,
        overdueReceivablesValue: 500,
        inactiveCustomers90Days: 10,
        activeCustomers: 50,
        customersWithPhone: 50,
      }),
    );

    const mensagens = result
      .filter((s) => s.action === AutomationAction.SEND_WHATSAPP)
      .map((s) => s.actionConfig.messageTemplate as string);

    expect(mensagens.length).toBeGreaterThan(0);
    for (const m of mensagens) {
      expect(m).toContain('{{customerName}}');
    }
  });
});
