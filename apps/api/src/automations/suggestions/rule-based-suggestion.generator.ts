import { Injectable } from '@nestjs/common';
import { AutomationAction, AutomationTrigger, UserRole } from '@prisma/client';
import { BusinessSignals, BusinessSnapshot, SnapshotUser } from '../business-snapshot.service';
import { GeneratedSuggestion, MAX_SUGGESTIONS, SuggestionGenerator, formatBRL } from './suggestion-generator.interface';

/**
 * Abaixo desta proporção de clientes com telefone, mandar WhatsApp em massa
 * falharia mais do que funcionaria — a heurística troca a ação por "criar
 * tarefa", que nunca falha por falta de contato.
 */
const MIN_PHONE_COVERAGE = 0.5;

interface Heuristic {
  /** Só propõe se houver sinal suficiente — evita sugerir por causa de um caso isolado. */
  applies(s: BusinessSignals): boolean;
  /** Quanto maior, mais acima aparece na lista. Dinheiro parado pesa mais. */
  priority(s: BusinessSignals): number;
  build(s: BusinessSignals, ctx: Context): GeneratedSuggestion;
}

interface Context {
  /** Responsável padrão das tarefas: um admin ativo. */
  assignee: SnapshotUser;
  /** Se dá pra contar com WhatsApp nesta base de clientes. */
  canUseWhatsApp: boolean;
}

/**
 * Gera sugestões de automação a partir dos números do próprio sistema — sem
 * nenhuma chamada externa, sem custo por uso e com resposta instantânea.
 *
 * O raciocínio aqui é o mesmo que a IA fazia, escrito explicitamente: olhar
 * cada sinal, comparar com um limiar, e propor a automação correspondente com
 * a justificativa citando o número real. A IA nunca teve acesso a nada além
 * destes mesmos agregados — ela só redigia o texto em volta deles.
 *
 * O que se ganha: custo zero, resposta imediata, redação previsível e
 * auditável, funciona offline e sem chave de API.
 * O que se perde: a redação não se adapta ao contexto específico do negócio,
 * e combinações que ninguém previu aqui não aparecem. Para quem quiser isso,
 * o AiSuggestionGenerator continua disponível via SUGGESTION_ENGINE=ai.
 */
@Injectable()
export class RuleBasedSuggestionGenerator implements SuggestionGenerator {
  private readonly heuristics: Heuristic[] = [
    // ---------------------------------------------------------------
    // Dinheiro que ainda VAI vencer — o lembrete que evita a cobrança.
    //
    // Prioridade abaixo da cobrança do vencido (aquilo já é prejuízo), mas
    // acima do resto: é a única automação que impede o problema em vez de
    // remediá-lo, e no fiado de balcão o cliente quase sempre só esqueceu.
    // ---------------------------------------------------------------
    {
      applies: (s) => s.receivablesDueSoon >= 2,
      priority: (s) => 900 + s.receivablesDueSoonValue,
      build: (s, ctx) =>
        ctx.canUseWhatsApp
          ? {
              name: 'Lembrete antes de vencer',
              rationale: `Há ${s.receivablesDueSoon} contas a receber vencendo nos próximos dias, somando ${formatBRL(
                s.receivablesDueSoonValue,
              )}. Um lembrete três dias antes evita a cobrança depois — e o cliente costuma agradecer.`,
              trigger: AutomationTrigger.RECEIVABLE_DUE_IN_DAYS,
              triggerConfig: { days: 3 },
              action: AutomationAction.SEND_WHATSAPP,
              actionConfig: {
                messageTemplate:
                  'Olá, {{customerName}}! Passando para lembrar que você tem uma conta com a gente vencendo em breve. Qualquer dúvida ou se quiser combinar outra data, é só responder por aqui.',
              },
            }
          : {
              name: 'Avisar a equipe antes do vencimento',
              rationale: `Há ${s.receivablesDueSoon} contas a receber vencendo nos próximos dias, somando ${formatBRL(
                s.receivablesDueSoonValue,
              )}. Como a maioria dos clientes não tem telefone cadastrado, o lembrete vira tarefa para a equipe.`,
              trigger: AutomationTrigger.RECEIVABLE_DUE_IN_DAYS,
              triggerConfig: { days: 3 },
              action: AutomationAction.CREATE_TASK,
              actionConfig: {
                titleTemplate: 'Lembrar {{customerName}} da conta que vence em 3 dias',
                assignToId: ctx.assignee.id,
              },
            },
    },

    // ---------------------------------------------------------------
    // Dinheiro já vencido — maior prioridade: é caixa que já era seu.
    // ---------------------------------------------------------------
    {
      applies: (s) => s.overdueReceivables >= 3,
      priority: (s) => 1000 + s.overdueReceivablesValue,
      build: (s, ctx) =>
        ctx.canUseWhatsApp
          ? {
              name: 'Cobrança automática de contas vencidas',
              rationale: `Há ${s.overdueReceivables} contas a receber vencidas, somando ${formatBRL(
                s.overdueReceivablesValue,
              )}. Um lembrete automático costuma recuperar boa parte disso sem ninguém precisar ligar.`,
              trigger: AutomationTrigger.RECEIVABLE_OVERDUE_DAYS,
              triggerConfig: { days: 5 },
              action: AutomationAction.SEND_WHATSAPP,
              actionConfig: {
                messageTemplate:
                  'Olá, {{customerName}}! Identificamos uma conta em aberto e já vencida por aqui. Consegue dar uma olhada? Se já tiver pago ou quiser combinar outra data, é só responder esta mensagem.',
              },
            }
          : {
              name: 'Avisar a equipe sobre contas vencidas',
              rationale: `Há ${s.overdueReceivables} contas a receber vencidas, somando ${formatBRL(
                s.overdueReceivablesValue,
              )}. Como a maioria dos clientes não tem telefone cadastrado, a cobrança vira tarefa para a equipe.`,
              trigger: AutomationTrigger.RECEIVABLE_OVERDUE_DAYS,
              triggerConfig: { days: 5 },
              action: AutomationAction.CREATE_TASK,
              actionConfig: {
                titleTemplate: 'Cobrar conta vencida de {{customerName}}',
                assignToId: ctx.assignee.id,
              },
            },
    },

    // ---------------------------------------------------------------
    // Dinheiro na mesa — orçamento parado é venda quase fechada.
    // ---------------------------------------------------------------
    {
      applies: (s) => s.pendingQuotesOver3Days >= 2,
      priority: (s) => 900 + s.pendingQuotesValue,
      build: (s, ctx) =>
        ctx.canUseWhatsApp
          ? {
              name: 'Retomar orçamentos parados',
              rationale: `${s.pendingQuotesOver3Days} orçamentos estão há mais de 3 dias sem resposta, somando ${formatBRL(
                s.pendingQuotesValue,
              )}. Uma mensagem no terceiro dia costuma destravar parte deles.`,
              trigger: AutomationTrigger.QUOTE_PENDING_DAYS,
              triggerConfig: { days: 3 },
              action: AutomationAction.SEND_WHATSAPP,
              actionConfig: {
                messageTemplate:
                  'Oi, {{customerName}}! Passando para saber se ficou alguma dúvida sobre o orçamento que enviamos. Ele continua valendo — é só responder aqui que a gente resolve.',
              },
            }
          : {
              name: 'Cobrar retorno dos orçamentos parados',
              rationale: `${s.pendingQuotesOver3Days} orçamentos estão há mais de 3 dias sem resposta, somando ${formatBRL(
                s.pendingQuotesValue,
              )}.`,
              trigger: AutomationTrigger.QUOTE_PENDING_DAYS,
              triggerConfig: { days: 3 },
              action: AutomationAction.CREATE_TASK,
              actionConfig: {
                titleTemplate: 'Ligar para {{customerName}} sobre o orçamento parado',
                assignToId: ctx.assignee.id,
              },
            },
    },

    // ---------------------------------------------------------------
    // Ruptura de estoque — perde venda sem ninguém perceber.
    // ---------------------------------------------------------------
    {
      applies: (s) => s.lowStockProducts >= 1,
      priority: (s) => 800 + s.lowStockProducts,
      build: (s, ctx) => ({
        name: 'Avisar quando o estoque ficar baixo',
        rationale: `${s.lowStockProducts} ${
          s.lowStockProducts === 1 ? 'produto está' : 'produtos estão'
        } no estoque mínimo ou abaixo dele. Sem aviso, a falta só aparece quando o cliente pede e não tem.`,
        trigger: AutomationTrigger.LOW_STOCK,
        triggerConfig: null,
        // Estoque baixo dispara sobre um produto: não há cliente para avisar.
        action: AutomationAction.CREATE_TASK,
        actionConfig: {
          titleTemplate: 'Repor estoque — item abaixo do mínimo',
          assignToId: ctx.assignee.id,
        },
      }),
    },

    // ---------------------------------------------------------------
    // Pipeline travado.
    // ---------------------------------------------------------------
    {
      applies: (s) => s.staleOpportunitiesOver7Days >= 2,
      priority: (s) => 700 + s.staleOpportunitiesOver7Days,
      build: (s, ctx) => ({
        name: 'Retomar oportunidades paradas no funil',
        rationale: `${s.staleOpportunitiesOver7Days} oportunidades estão há mais de 7 dias na mesma etapa. Negócio parado no funil raramente volta a andar sozinho.`,
        trigger: AutomationTrigger.OPPORTUNITY_STALE_DAYS,
        triggerConfig: { days: 7 },
        action: AutomationAction.CREATE_TASK,
        actionConfig: {
          titleTemplate: 'Dar andamento na oportunidade de {{customerName}}',
          assignToId: ctx.assignee.id,
        },
      }),
    },

    // ---------------------------------------------------------------
    // Serviço parado — cliente esperando sem retorno.
    // ---------------------------------------------------------------
    {
      applies: (s) => s.staleServiceOrdersOver5Days >= 2,
      priority: (s) => 600 + s.staleServiceOrdersOver5Days,
      build: (s, ctx) => ({
        name: 'Cobrar andamento das ordens de serviço',
        rationale: `${s.staleServiceOrdersOver5Days} ordens de serviço estão há mais de 5 dias sem atualização. Cliente esperando sem notícia é reclamação a caminho.`,
        trigger: AutomationTrigger.SERVICE_ORDER_STALE_DAYS,
        triggerConfig: { days: 5 },
        action: AutomationAction.CREATE_TASK,
        actionConfig: {
          titleTemplate: 'Atualizar a OS de {{customerName}}',
          assignToId: ctx.assignee.id,
        },
      }),
    },

    // ---------------------------------------------------------------
    // Reativação — cuidado com volume: é a que mais gasta WhatsApp.
    // ---------------------------------------------------------------
    {
      applies: (s) => s.inactiveCustomers90Days >= 5,
      priority: (s) => 500 + Math.min(s.inactiveCustomers90Days, 99),
      build: (s, ctx) =>
        ctx.canUseWhatsApp
          ? {
              name: 'Reativar clientes que sumiram',
              rationale: `${s.inactiveCustomers90Days} clientes que já compraram não voltam há mais de 90 dias. Reconquistar cliente antigo custa menos que achar cliente novo.`,
              trigger: AutomationTrigger.CUSTOMER_INACTIVE_DAYS,
              triggerConfig: { days: 90 },
              action: AutomationAction.SEND_WHATSAPP,
              actionConfig: {
                messageTemplate:
                  'Oi, {{customerName}}! Faz um tempo que a gente não se fala. Se precisar de alguma coisa, é só chamar aqui — vai ser bom te atender de novo.',
              },
            }
          : {
              name: 'Trabalhar a carteira de clientes inativos',
              rationale: `${s.inactiveCustomers90Days} clientes que já compraram não voltam há mais de 90 dias.`,
              trigger: AutomationTrigger.CUSTOMER_INACTIVE_DAYS,
              triggerConfig: { days: 90 },
              action: AutomationAction.CREATE_TASK,
              actionConfig: {
                titleTemplate: 'Retomar contato com {{customerName}}',
                assignToId: ctx.assignee.id,
              },
            },
    },

    // ---------------------------------------------------------------
    // Pós-venda: não depende de sinal, mas só faz sentido se já há venda.
    // ---------------------------------------------------------------
    {
      applies: (s) => s.activeCustomers >= 3,
      priority: () => 100,
      build: (_s, ctx) => ({
        name: 'Follow-up depois da venda',
        rationale:
          'Toda venda confirmada abre uma tarefa de retorno. É o hábito que mais gera recompra e review positivo, e não custa nada por disparo.',
        trigger: AutomationTrigger.SALE_CONFIRMED,
        triggerConfig: null,
        action: AutomationAction.CREATE_TASK,
        actionConfig: {
          titleTemplate: 'Confirmar satisfação de {{customerName}} após a compra',
          assignToId: ctx.assignee.id,
        },
      }),
    },
  ];

  async generate(snapshot: BusinessSnapshot): Promise<GeneratedSuggestion[]> {
    const assignee = this.pickAssignee(snapshot.users);
    // Sem ninguém para atribuir tarefa, metade das sugestões seria inválida.
    if (!assignee) return [];

    const { signals } = snapshot;
    const ctx: Context = {
      assignee,
      canUseWhatsApp:
        signals.activeCustomers > 0 && signals.customersWithPhone / signals.activeCustomers >= MIN_PHONE_COVERAGE,
    };

    // Não repetir o que já existe nem o que já foi recusado. A comparação é
    // por (gatilho + ação), o mesmo par que define uma automação na prática.
    const taken = new Set(
      [...snapshot.existingRules, ...snapshot.dismissed].map((r) => `${r.trigger}:${r.action}`),
    );

    return this.heuristics
      .filter((h) => h.applies(signals))
      .sort((a, b) => b.priority(signals) - a.priority(signals))
      .map((h) => h.build(signals, ctx))
      .filter((s) => !taken.has(`${s.trigger}:${s.action}`))
      .slice(0, MAX_SUGGESTIONS);
  }

  /**
   * Prefere um ADMIN; se não houver, qualquer usuário ativo serve. A tarefa
   * pode ser reatribuída depois — o que não pode é a regra nascer apontando
   * pra ninguém e falhar no disparo.
   */
  private pickAssignee(users: SnapshotUser[]): SnapshotUser | undefined {
    return users.find((u) => u.role === UserRole.ADMIN) ?? users[0];
  }
}
