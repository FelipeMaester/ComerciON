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

export interface LLMChatResult {
  assistantText: string | null;
  toolCalls: LLMToolCall[];
}

export interface LLMProvider {
  chat(messages: LLMChatMessage[], tools: LLMToolDefinition[]): Promise<LLMChatResult>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
