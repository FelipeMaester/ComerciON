// Abstração do provedor de LLM — mesmo espírito do WhatsAppProvider
// (apps/api/src/whatsapp/whatsapp-provider.interface.ts): o resto do sistema
// (AiService, tools, controller) nunca fala com Anthropic/OpenAI diretamente,
// só com esta interface. Trocar de provedor é trocar a implementação
// injetada em AiModule — nada mais muda.

export interface LLMToolDefinition {
  name: string;
  description: string;
  // JSON Schema simples — o mesmo objeto serve tanto pro `input_schema` da
  // Anthropic quanto pro `parameters` da OpenAI, sem tradução.
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type LLMChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  // toolCalls preenchido quando esta mensagem representa uma rodada em que o
  // assistente pediu tool(s) — precisa ser reenviada junto do tool_result na
  // próxima chamada (Anthropic e OpenAI exigem os dois emparelhados).
  | { role: 'assistant'; content: string | null; toolCalls?: LLMToolCall[] }
  | { role: 'tool'; toolCallId: string; toolName: string; content: string };

/**
 * Consumo da chamada, quando o provedor informa. Existe para o custo ser
 * observável em produção: sem isto não há como saber se o cache de prompt
 * está pegando (cacheReadTokens > 0) ou se toda pergunta está pagando o
 * andaime de ferramentas inteiro de novo.
 */
export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface LLMChatResult {
  assistantText: string | null;
  toolCalls: LLMToolCall[];
  usage?: LLMUsage;
}

export interface LLMChatOptions {
  /**
   * Teto de tokens da resposta. O padrão (1024) serve pro chat, onde as
   * respostas são curtas. Tarefas que devolvem JSON estruturado precisam de
   * mais: as sugestões de automação estouraram exatamente em 1024 e voltaram
   * com o array cortado no meio, que o JSON.parse rejeitava inteiro.
   */
  maxTokens?: number;
}

export interface LLMProvider {
  chat(messages: LLMChatMessage[], tools: LLMToolDefinition[], options?: LLMChatOptions): Promise<LLMChatResult>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
