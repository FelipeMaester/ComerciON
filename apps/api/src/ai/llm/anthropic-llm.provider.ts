import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlockParam, MessageParam, TextBlock, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';
import { LLMChatMessage, LLMChatResult, LLMProvider, LLMToolCall, LLMToolDefinition } from './llm-provider.interface';

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1024;

@Injectable()
export class AnthropicLlmProvider implements LLMProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(messages: LLMChatMessage[], tools: LLMToolDefinition[]): Promise<LLMChatResult> {
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

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: anthropicMessages,
      tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
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
    };
  }
}
