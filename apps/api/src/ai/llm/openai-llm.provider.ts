import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { LLMChatMessage, LLMChatResult, LLMProvider, LLMToolCall, LLMToolDefinition } from './llm-provider.interface';

const MODEL = 'gpt-4o-mini';

@Injectable()
export class OpenAiLlmProvider implements LLMProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat(messages: LLMChatMessage[], tools: LLMToolDefinition[]): Promise<LLMChatResult> {
    const openaiMessages: ChatCompletionMessageParam[] = messages.map((m) => {
      if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
      }
      if (m.role === 'assistant') {
        return {
          role: 'assistant',
          content: m.content,
          tool_calls: m.toolCalls?.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: { name: call.name, arguments: JSON.stringify(call.arguments) },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });

    const openaiTools: ChatCompletionTool[] = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const response = await this.client.chat.completions.create({
      model: MODEL,
      messages: openaiMessages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
    });

    const message = response.choices[0]?.message;
    const toolCalls: LLMToolCall[] = (message?.tool_calls ?? [])
      .filter((call): call is Extract<typeof call, { type: 'function' }> => call.type === 'function')
      .map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: safeParseJson(call.function.arguments),
      }));

    return {
      assistantText: message?.content ?? null,
      toolCalls,
    };
  }
}

function safeParseJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
