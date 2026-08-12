import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AutomationAction, AutomationSuggestion, AutomationSuggestionStatus, AutomationTrigger, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ACTION_CATALOG, TRIGGERS_REQUIRING_DAYS, TRIGGER_CATALOG } from './automation-catalog';
import { AutomationRulesService } from './automation-rules.service';
import { BusinessSnapshotService } from './business-snapshot.service';
import {
  GeneratedSuggestion,
  MAX_SUGGESTIONS,
  SUGGESTION_GENERATOR,
  SuggestionGenerator,
} from './suggestions/suggestion-generator.interface';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Idade a partir da qual o cache é considerado velho. A tela lê sempre do
 * cache; o recálculo só acontece quando alguém clica em "Analisar de novo".
 */
const CACHE_STALE_DAYS = 7;

interface SuggestionsResponse {
  suggestions: AutomationSuggestion[];
  generatedAt: Date | null;
  isStale: boolean;
  /** Preenchido quando o recálculo foi dispensado por falta de dados. */
  skipped?: string;
}

/**
 * Orquestra as sugestões de automação: pega o retrato do negócio, pede ao
 * gerador configurado, valida contra o catálogo e persiste.
 *
 * O gerador é plugável (ver suggestions/suggestion-generator.interface.ts). O
 * padrão é o motor de REGRAS, que não custa nada: ele lê os mesmos números
 * agregados e monta as sugestões diretamente. A IA é opcional
 * (SUGGESTION_ENGINE=ai) e não muda em nada o resto deste arquivo.
 *
 * As sugestões continuam persistidas mesmo no motor gratuito, por dois
 * motivos que não têm a ver com custo: o usuário precisa poder descartar uma
 * sugestão e ela não voltar, e aceitar precisa deixar rastro de qual regra
 * nasceu de qual sugestão.
 */
@Injectable()
export class AutomationSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rulesService: AutomationRulesService,
    private readonly snapshotService: BusinessSnapshotService,
    @Inject(SUGGESTION_GENERATOR) private readonly generator: SuggestionGenerator,
  ) {}

  async list(): Promise<SuggestionsResponse> {
    const suggestions = await this.prisma.automationSuggestion.findMany({
      where: { status: AutomationSuggestionStatus.PENDING },
      orderBy: { generatedAt: 'desc' },
    });

    const newest = suggestions[0]?.generatedAt ?? null;
    return {
      suggestions,
      generatedAt: newest,
      isStale: newest === null || newest.getTime() < Date.now() - CACHE_STALE_DAYS * DAY_MS,
    };
  }

  async refresh(): Promise<SuggestionsResponse> {
    const snapshot = await this.snapshotService.build();

    if (!snapshot.hasAnySignal) {
      await this.clearPending();
      return {
        suggestions: [],
        generatedAt: new Date(),
        isStale: false,
        skipped: 'sem dados suficientes para analisar',
      };
    }

    const generated = await this.generator.generate(snapshot);

    // Validação única, valendo para qualquer gerador. O motor de regras não
    // deveria produzir nada inválido — mas se uma heurística nova quebrar uma
    // invariante, ela é barrada aqui do mesmo jeito que uma alucinação da IA.
    const userIds = new Set(snapshot.users.map((u) => u.id));
    const valid = generated.filter((s) => this.isUsable(s, userIds)).slice(0, MAX_SUGGESTIONS);

    await this.clearPending();
    if (valid.length === 0) return { suggestions: [], generatedAt: new Date(), isStale: false };

    await this.prisma.automationSuggestion.createMany({
      data: valid.map((s) => ({
        name: s.name,
        rationale: s.rationale,
        trigger: s.trigger,
        triggerConfig: (s.triggerConfig ?? null) as Prisma.InputJsonValue,
        action: s.action,
        actionConfig: s.actionConfig as Prisma.InputJsonValue,
      })) as Prisma.AutomationSuggestionUncheckedCreateInput[],
    });

    return this.list();
  }

  /** Vira regra de verdade. Passa pelo mesmo validador do cadastro manual. */
  async accept(id: string) {
    const suggestion = await this.findPending(id);

    const rule = await this.rulesService.create({
      name: suggestion.name,
      trigger: suggestion.trigger,
      triggerConfig: (suggestion.triggerConfig as Prisma.JsonObject as Record<string, unknown>) ?? undefined,
      action: suggestion.action,
      actionConfig: suggestion.actionConfig as Prisma.JsonObject as Record<string, unknown>,
      // Nasce ativa: aceitar é a confirmação. O usuário viu o gatilho, o texto
      // que vai sair e o motivo antes de clicar.
      isActive: true,
    });

    await this.prisma.automationSuggestion.update({
      where: { id },
      data: { status: AutomationSuggestionStatus.ACCEPTED, createdRuleId: rule.id },
    });

    return rule;
  }

  async dismiss(id: string) {
    await this.findPending(id);
    return this.prisma.automationSuggestion.update({
      where: { id },
      data: { status: AutomationSuggestionStatus.DISMISSED },
    });
  }

  private async findPending(id: string) {
    const suggestion = await this.prisma.automationSuggestion.findUnique({ where: { id } });
    if (!suggestion) throw new NotFoundException('Sugestão não encontrada');
    if (suggestion.status !== AutomationSuggestionStatus.PENDING) {
      throw new BadRequestException('Esta sugestão já foi aceita ou descartada');
    }
    return suggestion;
  }

  private clearPending() {
    return this.prisma.automationSuggestion.deleteMany({ where: { status: AutomationSuggestionStatus.PENDING } });
  }

  /**
   * Valida a sugestão contra o mesmo catálogo que rege o cadastro manual.
   * O que não passar aqui é descartado em silêncio, em vez de virar sugestão
   * quebrada na tela ou regra que só falha na madrugada seguinte.
   */
  private isUsable(s: GeneratedSuggestion, userIds: Set<string>): boolean {
    const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
    if (!nonEmpty(s.name) || !nonEmpty(s.rationale)) return false;

    const trigger = s.trigger as AutomationTrigger;
    const action = s.action as AutomationAction;
    if (!(trigger in TRIGGER_CATALOG) || !(action in ACTION_CATALOG)) return false;

    if (ACTION_CATALOG[action].contactsCustomer && !TRIGGER_CATALOG[trigger].hasCustomer) return false;

    if (TRIGGERS_REQUIRING_DAYS.has(trigger)) {
      const days = (s.triggerConfig as { days?: unknown } | null)?.days;
      if (typeof days !== 'number' || !Number.isInteger(days) || days <= 0) return false;
    }

    const config = s.actionConfig as Record<string, unknown> | undefined;
    if (!config) return false;
    for (const field of ACTION_CATALOG[action].fields) {
      if (!field.required) continue;
      if (!nonEmpty(config[field.key])) return false;
      if (field.type === 'user' && !userIds.has(config[field.key] as string)) return false;
    }

    return true;
  }
}
