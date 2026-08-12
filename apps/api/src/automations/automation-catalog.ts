import { AutomationAction, AutomationEntityType, AutomationTrigger } from '@prisma/client';

/**
 * Fonte ÚNICA de verdade do catálogo de automações.
 *
 * Antes da Fase F, os rótulos em português e a lista de quais gatilhos pedem
 * "days" viviam duplicados à mão no frontend (apps/web .../automations/page.tsx).
 * Adicionar um gatilho no enum do Prisma não fazia nada aparecer na tela, e uma
 * regra com gatilho que o frontend não conhecia renderizava `undefined`.
 *
 * Agora tudo — rótulo, descrição, campos de configuração, tipo de entidade
 * afetada — sai daqui e é servido por GET /automation-rules/catalog. A tela se
 * monta a partir da resposta. O motor (AutomationEngineService) e o validador
 * (AutomationRulesService) também leem daqui, então os três nunca divergem.
 *
 * O `satisfies Record<AutomationTrigger, ...>` no fim é o que garante isso em
 * tempo de compilação: acrescentar um valor ao enum sem descrevê-lo aqui
 * quebra o build em vez de vazar silenciosamente pra tela.
 */

/** Campo de configuração que o usuário preenche ao montar a regra. */
export interface CatalogField {
  key: string;
  label: string;
  type: 'number' | 'text' | 'textarea' | 'user';
  required: boolean;
  /** Sugestão inicial no formulário — não é o valor efetivo se o campo for obrigatório. */
  defaultValue?: string | number;
  help?: string;
  min?: number;
}

export interface TriggerMeta {
  label: string;
  description: string;
  /** Se roda no cron diário (varredura) ou na hora, disparado por um evento de negócio. */
  kind: 'scheduled' | 'event';
  /** Sobre qual registro a regra dispara — define o que resolveCustomer() procura. */
  entityType: AutomationEntityType;
  /**
   * Se o registro do gatilho tem um cliente associado. LOW_STOCK dispara sobre
   * um produto: não há para quem mandar WhatsApp. Sem esta marca, a combinação
   * "estoque baixo → enviar WhatsApp" seria aceita no cadastro e só falharia
   * na madrugada seguinte, num log que ninguém está olhando.
   */
  hasCustomer: boolean;
  fields: CatalogField[];
}

export interface ActionMeta {
  label: string;
  description: string;
  fields: CatalogField[];
  /** Ações que falam com o cliente final: a tela avisa sobre custo por mensagem. */
  contactsCustomer: boolean;
}

const DAYS_FIELD = (label: string, defaultValue: number, help: string): CatalogField => ({
  key: 'days',
  label,
  type: 'number',
  required: true,
  defaultValue,
  min: 1,
  help,
});

export const TRIGGER_CATALOG = {
  QUOTE_PENDING_DAYS: {
    label: 'Orçamento parado há X dias',
    description: 'Orçamento continua aguardando aprovação do cliente depois do prazo que você definir.',
    kind: 'scheduled',
    entityType: AutomationEntityType.QUOTE,
    hasCustomer: true,
    fields: [DAYS_FIELD('Dias parado', 3, 'Conta a partir da criação do orçamento.')],
  },
  OPPORTUNITY_STALE_DAYS: {
    label: 'Oportunidade parada há X dias',
    description: 'Oportunidade aberta no pipeline sem mudar de etapa.',
    kind: 'scheduled',
    entityType: AutomationEntityType.OPPORTUNITY,
    hasCustomer: true,
    fields: [DAYS_FIELD('Dias sem mudar de etapa', 7, 'Conta a partir da última troca de etapa.')],
  },
  CUSTOMER_INACTIVE_DAYS: {
    label: 'Cliente sem comprar há X dias',
    description: 'Cliente ativo que não tem nenhuma venda confirmada na janela — base de campanha de reativação.',
    kind: 'scheduled',
    entityType: AutomationEntityType.CUSTOMER,
    hasCustomer: true,
    fields: [DAYS_FIELD('Dias sem comprar', 90, 'Considera apenas vendas confirmadas.')],
  },
  LOW_STOCK: {
    label: 'Estoque abaixo do mínimo',
    description: 'Soma do produto em todos os depósitos ficou igual ou abaixo do estoque mínimo cadastrado nele.',
    kind: 'scheduled',
    entityType: AutomationEntityType.PRODUCT,
    hasCustomer: false,
    fields: [],
  },
  RECEIVABLE_OVERDUE_DAYS: {
    label: 'Conta a receber vencida há X dias',
    description: 'Título em aberto que passou do vencimento — cobrança automática.',
    kind: 'scheduled',
    entityType: AutomationEntityType.FINANCIAL_ENTRY,
    hasCustomer: true,
    fields: [DAYS_FIELD('Dias de atraso', 5, 'Conta a partir da data de vencimento.')],
  },
  SERVICE_ORDER_STALE_DAYS: {
    label: 'Ordem de serviço parada há X dias',
    description: 'OS aberta ou em andamento que não é atualizada há algum tempo.',
    kind: 'scheduled',
    entityType: AutomationEntityType.SERVICE_ORDER,
    hasCustomer: true,
    fields: [DAYS_FIELD('Dias sem atualização', 5, 'Conta a partir da última alteração na OS.')],
  },
  SALE_CONFIRMED: {
    label: 'Venda confirmada',
    description: 'Dispara na hora em que uma venda é confirmada.',
    kind: 'event',
    entityType: AutomationEntityType.SALE,
    hasCustomer: true,
    fields: [],
  },
  OPPORTUNITY_WON: {
    label: 'Oportunidade ganha',
    description: 'Dispara quando uma oportunidade do pipeline é marcada como ganha.',
    kind: 'event',
    entityType: AutomationEntityType.OPPORTUNITY,
    hasCustomer: true,
    fields: [],
  },
  OPPORTUNITY_LOST: {
    label: 'Oportunidade perdida',
    description: 'Dispara quando uma oportunidade do pipeline é marcada como perdida.',
    kind: 'event',
    entityType: AutomationEntityType.OPPORTUNITY,
    hasCustomer: true,
    fields: [],
  },
} satisfies Record<AutomationTrigger, TriggerMeta>;

export const ACTION_CATALOG = {
  SEND_WHATSAPP: {
    label: 'Enviar WhatsApp',
    description: 'Manda uma mensagem para o telefone do cliente ligado ao registro.',
    contactsCustomer: true,
    fields: [
      {
        key: 'messageTemplate',
        label: 'Mensagem',
        type: 'textarea',
        required: true,
        help: 'Use {{customerName}} para inserir o nome do cliente.',
      },
    ],
  },
  CREATE_TASK: {
    label: 'Criar tarefa',
    description: 'Abre uma tarefa de follow-up para alguém da equipe, sem contatar o cliente.',
    contactsCustomer: false,
    fields: [
      {
        key: 'titleTemplate',
        label: 'Título da tarefa',
        type: 'text',
        required: true,
        help: 'Use {{customerName}} para inserir o nome do cliente.',
      },
      { key: 'assignToId', label: 'Responsável', type: 'user', required: true },
    ],
  },
} satisfies Record<AutomationAction, ActionMeta>;

/**
 * Só os gatilhos varridos pelo cron, como união de tipos — extraída do próprio
 * catálogo (o `satisfies` acima preserva 'scheduled'/'event' como literais).
 * É isso que faz o motor não compilar se um gatilho agendado novo entrar no
 * catálogo sem ganhar um scanner correspondente.
 */
export type ScheduledTrigger = {
  [K in AutomationTrigger]: (typeof TRIGGER_CATALOG)[K]['kind'] extends 'scheduled' ? K : never;
}[AutomationTrigger];

/** Gatilhos varridos pelo cron diário (os demais são disparados por evento). */
export const SCHEDULED_TRIGGERS = (Object.keys(TRIGGER_CATALOG) as AutomationTrigger[]).filter(
  (t): t is ScheduledTrigger => TRIGGER_CATALOG[t].kind === 'scheduled',
);

/** Gatilhos que exigem `{ days: n }` em triggerConfig — derivado, nunca redigitado. */
export const TRIGGERS_REQUIRING_DAYS = new Set<AutomationTrigger>(
  (Object.keys(TRIGGER_CATALOG) as AutomationTrigger[]).filter((t) =>
    TRIGGER_CATALOG[t].fields.some((f) => f.key === 'days'),
  ),
);

export function entityTypeForTrigger(trigger: AutomationTrigger): AutomationEntityType {
  return TRIGGER_CATALOG[trigger].entityType;
}

/** Payload de GET /automation-rules/catalog — é isto que a tela consome. */
export function buildCatalogResponse() {
  return {
    triggers: (Object.keys(TRIGGER_CATALOG) as AutomationTrigger[]).map((value) => ({
      value,
      ...TRIGGER_CATALOG[value],
    })),
    actions: (Object.keys(ACTION_CATALOG) as AutomationAction[]).map((value) => ({
      value,
      ...ACTION_CATALOG[value],
    })),
  };
}
