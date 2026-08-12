import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlockParam, MessageParam, TextBlock, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';
import {
  LLMChatMessage,
  LLMChatOptions,
  LLMChatResult,
  LLMProvider,
  LLMToolCall,
  LLMToolDefinition,
} from './llm-provider.interface';

const MODEL = 'claude-sonnet-5';
const DEFAULT_MAX_TOKENS = 1024;

@Injectable()
export class AnthropicLlmProvider implements LLMProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(messages: LLMChatMessage[], tools: LLMToolDefinition[], options?: LLMChatOptions): Promise<LLMChatResult> {
    // A Anthropic trata o system prompt como parâmetro separado, não como
    // mensagem — extraímos a primeira mensagem "system" (se houver).
    const system = messages.find((m): m is Extract<LLMChatMessage, { role: 'system' }> => m.role === 'system')?.content;
    const conversation = messages.filter((m) => m.role !== 'system');

    const anthropicMessages: MessageParam[] = conversation.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }],
        };
      }
      if (m.role === 'assistant') {
        // Reconstrói os blocos tool_use da rodada anterior — a Anthropic
        // exige que o tool_result seguinte esteja emparelhado com o mesmo id.
        const blocks: ContentBlockParam[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const call of m.toolCalls ?? []) {
          blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments });
        }
        return { role: 'assistant', content: blocks.length > 0 ? blocks : '' };
      }
      return { role: 'user', content: m.content };
    });

    const anthropicTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      // O prefixo enviado é sempre: tools -> system -> messages. Marcar o
      // bloco do system com cache_control coloca o ponto de corte logo depois
      // das ferramentas, então tools + system inteiros entram no cache.
      //
      // Isso importa muito no custo: esse andaime tem ~1.071 tokens e é
      // idêntico byte a byte em toda chamada. Como cada pergunta faz duas
      // rodadas (uma pra pedir a tool, outra pra responder), sem cache
      // pagam-se ~2.142 tokens repetidos por pergunta — 78% da entrada.
      // Leitura de cache custa 10% do preço de entrada.
      //
      // ATENÇÃO: o mínimo cacheável do Sonnet é 1024 tokens. Estamos só 47
      // tokens acima disso — encurtar as descrições das tools em
      // ai-tools.service.ts pode derrubar o andaime abaixo do mínimo e
      // desligar o cache silenciosamente (a API não avisa, só para de
      // cachear). Há um teste guardando esse limite.
      system: system ? [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }] : undefined,
      messages: anthropicMessages,
      // A API rejeita `tools: []`; omitir é o correto quando não há ferramenta
      // (o caso das sugestões de automação, que só pedem JSON de volta).
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    });

    const textBlocks = response.content.filter((b): b is TextBlock => b.type === 'text');
    const toolUseBlocks = response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');

    const toolCalls: LLMToolCall[] = toolUseBlocks.map((b) => ({
      id: b.id,
      name: b.name,
      arguments: (b.input as Record<string, unknown>) ?? {},
    }));

    return {
      assistantText: textBlocks.length > 0 ? textBlocks.map((b) => b.text).join('\n') : null,
      toolCalls,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }
}
