import { AutomationAction, AutomationTrigger } from '@prisma/client';
import { BusinessSnapshot } from '../business-snapshot.service';

/**
 * Uma sugestão antes de ser validada e gravada. Formato idêntico ao que o
 * cadastro manual aceita, de propósito: aceitar uma sugestão é só passá-la
 * pelo mesmo AutomationRulesService.create() de sempre.
 */
export interface GeneratedSuggestion {
  name: string;
  /** O número concreto que motivou — é o que o dono do negócio lê pra decidir. */
  rationale: string;
  trigger: AutomationTrigger;
  triggerConfig: Record<string, unknown> | null;
  action: AutomationAction;
  actionConfig: Record<string, unknown>;
}

/**
 * Abstração do motor de sugestões — mesmo espírito do WhatsAppProvider e do
 * LLMProvider: o resto do sistema não sabe se as sugestões vieram de regras
 * determinísticas ou de um modelo de linguagem.
 *
 * Duas implementações:
 *   - RuleBasedSuggestionGenerator (padrão): custo zero, resposta imediata,
 *     mesmos números, redação previsível.
 *   - AiSuggestionGenerator: opcional, pago, redação mais adaptada ao caso.
 *
 * A escolha é uma variável de ambiente (SUGGESTION_ENGINE) — ver
 * automations.module.ts.
 */
export interface SuggestionGenerator {
  generate(snapshot: BusinessSnapshot): Promise<GeneratedSuggestion[]>;
}

export const SUGGESTION_GENERATOR = Symbol('SUGGESTION_GENERATOR');

/** Teto de sugestões por rodada — mais que isto vira ruído, não ajuda a decidir. */
export const MAX_SUGGESTIONS = 6;

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
