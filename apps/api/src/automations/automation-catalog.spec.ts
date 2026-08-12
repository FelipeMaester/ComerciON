import { AutomationAction, AutomationTrigger } from '@prisma/client';
import {
  ACTION_CATALOG,
  SCHEDULED_TRIGGERS,
  TRIGGERS_REQUIRING_DAYS,
  TRIGGER_CATALOG,
  buildCatalogResponse,
  entityTypeForTrigger,
} from './automation-catalog';

describe('automation-catalog', () => {
  it('descreve TODO gatilho e TODA ação do enum do Prisma', () => {
    // Este é o teste que impede a volta do bug original: um gatilho novo no
    // schema sem entrada aqui deixaria a tela renderizando "undefined".
    // (O `satisfies` já garante isso em tempo de compilação; aqui fica
    // registrado também em runtime, caso o enum passe a ser gerado.)
    for (const trigger of Object.values(AutomationTrigger)) {
      expect(TRIGGER_CATALOG[trigger]).toBeDefined();
      expect(TRIGGER_CATALOG[trigger].label.length).toBeGreaterThan(0);
    }
    for (const action of Object.values(AutomationAction)) {
      expect(ACTION_CATALOG[action]).toBeDefined();
    }
  });

  it('deriva a lista de gatilhos que exigem "days" em vez de repetir à mão', () => {
    expect(TRIGGERS_REQUIRING_DAYS.has(AutomationTrigger.QUOTE_PENDING_DAYS)).toBe(true);
    expect(TRIGGERS_REQUIRING_DAYS.has(AutomationTrigger.RECEIVABLE_OVERDUE_DAYS)).toBe(true);
    // Estoque baixo é uma comparação com o mínimo cadastrado, não tem janela.
    expect(TRIGGERS_REQUIRING_DAYS.has(AutomationTrigger.LOW_STOCK)).toBe(false);
    expect(TRIGGERS_REQUIRING_DAYS.has(AutomationTrigger.SALE_CONFIRMED)).toBe(false);
  });

  it('separa gatilhos agendados dos disparados por evento', () => {
    expect(SCHEDULED_TRIGGERS).toContain(AutomationTrigger.LOW_STOCK);
    expect(SCHEDULED_TRIGGERS).toContain(AutomationTrigger.CUSTOMER_INACTIVE_DAYS);
    expect(SCHEDULED_TRIGGERS).not.toContain(AutomationTrigger.SALE_CONFIRMED);
  });

  it('marca como sem cliente exatamente os gatilhos que não têm um', () => {
    // Estoque baixo dispara sobre um produto — não há para quem mandar
    // mensagem. É essa marca que barra a combinação inválida no cadastro.
    expect(TRIGGER_CATALOG.LOW_STOCK.hasCustomer).toBe(false);
    const semCliente = Object.values(AutomationTrigger).filter((t) => !TRIGGER_CATALOG[t].hasCustomer);
    expect(semCliente).toEqual([AutomationTrigger.LOW_STOCK]);
  });

  it('todo gatilho aponta para o tipo de registro que o motor sabe resolver', () => {
    for (const trigger of Object.values(AutomationTrigger)) {
      expect(entityTypeForTrigger(trigger)).toBe(TRIGGER_CATALOG[trigger].entityType);
    }
  });

  it('serializa gatilhos e ações no formato que a tela consome', () => {
    const response = buildCatalogResponse();
    expect(response.triggers).toHaveLength(Object.values(AutomationTrigger).length);
    expect(response.actions).toHaveLength(Object.values(AutomationAction).length);

    const lowStock = response.triggers.find((t) => t.value === AutomationTrigger.LOW_STOCK);
    expect(lowStock).toMatchObject({ label: expect.any(String), kind: 'scheduled', hasCustomer: false, fields: [] });

    const whatsapp = response.actions.find((a) => a.value === AutomationAction.SEND_WHATSAPP);
    expect(whatsapp?.contactsCustomer).toBe(true);
    expect(whatsapp?.fields.map((f) => f.key)).toEqual(['messageTemplate']);
  });
});
