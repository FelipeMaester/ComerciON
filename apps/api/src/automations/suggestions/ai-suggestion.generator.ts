import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { AutomationAction, AutomationTrigger } from '@prisma/client';
import { LLMProvider } from '../../llm/llm-provider.interface';
import { ACTION_CATALOG, TRIGGERS_REQUIRING_DAYS, TRIGGER_CATALOG } from '../automation-catalog';
import { BusinessSnapshot } from '../business-snapshot.service';
import { GeneratedSuggestion, MAX_SUGGESTIONS, SuggestionGenerator } from './suggestion-generator.interface';

interface RawSuggestion {
  name?: unknown;
  rationale?: unknown;
  trigger?: unknown;
  triggerConfig?: unknown;
  action?: unknown;
  actionConfig?: unknown;
}

/**
 * Gerador opcional que pede as sugestões a um modelo de linguagem.
 *
 * Só é usado quando SUGGESTION_ENGINE=ai. O padrão do sistema é o
 * RuleBasedSuggestionGenerator, que produz sugestões a partir dos mesmos
 * números sem custo nenhum. Este aqui existe para quem quer texto adaptado ao
 * contexto do negócio e aceita pagar por isso (~US$ 0,035 por análise).
 *
 * Recebe exatamente o mesmo BusinessSnapshot do motor de regras: só contagens
 * e somas. Nenhum nome, telefone ou documento de cliente é enviado ao
 * provedor de IA.
 */
export class AiSuggestionGenerator implements SuggestionGenerator {
  private readonly logger = new Logger('AiSuggestionGenerator');

  constructor(private readonly llm: LLMProvider) {}

  async generate(snapshot: BusinessSnapshot): Promise<GeneratedSuggestion[]> {
    const result = await this.llm.chat(
      [
        { role: 'system', content: this.systemPrompt() },
        { role: 'user', content: JSON.stringify(this.toPromptPayload(snapshot)) },
      ],
      // Sem ferramentas: os dados já vão prontos no prompt. Uma rodada só.
      [],
      // O padrão de 1024 tokens serve pro chat, não pra isto: seis sugestões
      // com justificativa e mensagem em português passam disso com folga. Na
      // primeira execução real a resposta parou exatamente em 1024, o array
      // veio cortado e o JSON.parse rejeitou tudo.
      { maxTokens: 4096 },
    );

    if (result.usage) {
      const u = result.usage;
      this.logger.log(`Sugestões por IA: entrada=${u.inputTokens} saída=${u.outputTokens}`);
    }

    const parsed = this.parse(result.assistantText);
    if (parsed === null) {
      throw new ServiceUnavailableException(
        'A IA respondeu num formato que não consegui interpretar. Tente analisar de novo em alguns instantes.',
      );
    }

    return parsed.filter((s) => this.isWellFormed(s)).slice(0, MAX_SUGGESTIONS);
  }

  /** Traduz o retrato para o vocabulário do prompt (em português, como o modelo responde). */
  private toPromptPayload(snapshot: BusinessSnapshot) {
    const s = snapshot.signals;
    return {
      gatilhosDisponiveis: (Object.keys(TRIGGER_CATALOG) as AutomationTrigger[]).map((t) => ({
        valor: t,
        descricao: TRIGGER_CATALOG[t].label,
        precisaDias: TRIGGERS_REQUIRING_DAYS.has(t),
        temCliente: TRIGGER_CATALOG[t].hasCustomer,
      })),
      acoesDisponiveis: (Object.keys(ACTION_CATALOG) as AutomationAction[]).map((a) => ({
        valor: a,
        descricao: ACTION_CATALOG[a].label,
        falaComCliente: ACTION_CATALOG[a].contactsCustomer,
      })),
      usuariosParaAtribuirTarefa: snapshot.users.map((u) => ({ id: u.id, nome: u.name, papel: u.role })),
      automacoesJaExistentes: snapshot.existingRules,
      sugestoesJaRecusadas: snapshot.dismissed,
      situacaoAtual: {
        orcamentosParadosMais3Dias: s.pendingQuotesOver3Days,
        valorEmOrcamentosParados: s.pendingQuotesValue,
        oportunidadesParadasMais7Dias: s.staleOpportunitiesOver7Days,
        contasAReceberVencidas: s.overdueReceivables,
        valorVencidoAReceber: s.overdueReceivablesValue,
        ordensServicoParadasMais5Dias: s.staleServiceOrdersOver5Days,
        produtosAbaixoDoEstoqueMinimo: s.lowStockProducts,
        clientesSemComprarHa90Dias: s.inactiveCustomers90Days,
        clientesAtivos: s.activeCustomers,
        clientesComTelefoneCadastrado: s.customersWithPhone,
      },
    };
  }

  private systemPrompt(): string {
    return `Você é um consultor de operações comerciais analisando os dados de uma empresa no ComerciON (sistema de gestão brasileiro) para propor automações úteis.

Você receberá um JSON com: os gatilhos e ações disponíveis no sistema, as automações que já existem, sugestões que o usuário já recusou, e a situação atual do negócio em números.

Proponha no máximo ${MAX_SUGGESTIONS} automações, em ordem de impacto. Regras obrigatórias:

1. Só sugira algo que os números justifiquem. Se "orcamentosParadosMais3Dias" for 0, não sugira automação de orçamento parado.
2. Não repita uma automação que já existe em "automacoesJaExistentes" (mesmo gatilho + mesma ação).
3. Não repita nada que apareça em "sugestoesJaRecusadas" (mesmo gatilho + mesma ação).
4. Gatilho com "temCliente": false NUNCA pode usar ação com "falaComCliente": true. Use CREATE_TASK nesses casos.
5. Gatilho com "precisaDias": true exige triggerConfig {"days": N} com N inteiro positivo.
6. SEND_WHATSAPP exige actionConfig {"messageTemplate": "..."}. CREATE_TASK exige {"titleTemplate": "...", "assignToId": "<id de usuariosParaAtribuirTarefa>"}.
7. Use {{customerName}} nos textos onde o nome do cliente deve aparecer.
8. Mensagens de WhatsApp: português do Brasil, cordiais, curtas, sem emoji excessivo, assinadas pela empresa de forma neutra.
9. Cuidado com volume: se "clientesComTelefoneCadastrado" for muito menor que "clientesAtivos", prefira CREATE_TASK a SEND_WHATSAPP, porque a maioria dos envios falharia.
10. Em "rationale", cite o número concreto que motivou a sugestão. É o que o dono do negócio vai ler para decidir.

Responda APENAS com um array JSON, sem texto antes ou depois, sem cercas de código. Formato de cada item:
{"name":"...","rationale":"...","trigger":"...","triggerConfig":{...} ou null,"action":"...","actionConfig":{...}}`;
  }

  /**
   * Devolve `null` quando NÃO conseguiu interpretar, e `[]` quando interpretou
   * e o modelo realmente não propôs nada. A diferença importa: array vazio é
   * resposta legítima; resposta ilegível é falha e precisa virar erro.
   */
  private parse(text: string | null): RawSuggestion[] | null {
    if (!text || text.trim().length === 0) return null;
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      this.logger.warn('A IA devolveu uma resposta que não é JSON válido — provável truncamento por limite de tokens.');
      return null;
    }
  }

  /**
   * Só o suficiente para o objeto ter o formato certo. A validação de negócio
   * de verdade (gatilho existe, usuário existe, combinação é possível) é feita
   * uma vez só, no AutomationSuggestionsService, valendo para os dois motores.
   */
  private isWellFormed(s: RawSuggestion): s is GeneratedSuggestion {
    const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
    return nonEmpty(s.name) && nonEmpty(s.rationale) && nonEmpty(s.trigger) && nonEmpty(s.action);
  }
}
