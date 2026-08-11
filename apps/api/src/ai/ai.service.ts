import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AIMessageRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LLM_PROVIDER, LLMChatMessage, LLMProvider } from './llm/llm-provider.interface';
import { AiToolsService } from './tools/ai-tools.service';

const SYSTEM_PROMPT = `Você é a ComerciON IA, assistente comercial interno do ComerciON (sistema de gestão para pequenas e médias empresas). Responda sempre em português do Brasil, de forma direta e objetiva.

Você só conhece os dados desta empresa através das ferramentas disponíveis — nunca invente números, nomes de clientes ou valores. Se uma pergunta exigir dados que nenhuma ferramenta cobre, diga isso claramente em vez de arriscar um chute.`;

// Trava contra o modelo ficar pedindo tool atrás de tool indefinidamente —
// em uso normal, 1-2 rodadas já resolvem qualquer pergunta deste escopo.
const MAX_TOOL_ITERATIONS = 4;

@Injectable()
export class AiService {
  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LLMProvider,
    private readonly tools: AiToolsService,
    private readonly prisma: PrismaService,
  ) {}

  async listConversations(userId: string) {
    return this.prisma.aIConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getConversation(userId: string, id: string) {
    const conversation = await this.prisma.aIConversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation || conversation.userId !== userId) {
      throw new NotFoundException('Conversa não encontrada');
    }
    return conversation;
  }

  async sendMessage(userId: string, conversationId: string | undefined, text: string) {
    const conversation = await this.resolveConversation(userId, conversationId, text);

    await this.prisma.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: AIMessageRole.USER,
        content: text,
      } as Prisma.AIMessageUncheckedCreateInput,
    });

    // Só USER/ASSISTANT entram no histórico replay-ado entre turnos — o
    // texto final do assistente já sintetiza em linguagem natural o que as
    // tools trouxeram, então não precisamos reconstruir tool_use/tool_result
    // brutos de rodadas passadas. Dentro do loop desta chamada, o histórico
    // completo (com toolCalls reais) fica só em memória.
    const pastMessages = await this.prisma.aIMessage.findMany({
      where: { conversationId: conversation.id, role: { in: [AIMessageRole.USER, AIMessageRole.ASSISTANT] } },
      orderBy: { createdAt: 'asc' },
    });

    const history: LLMChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...pastMessages.map((m): LLMChatMessage =>
        m.role === AIMessageRole.ASSISTANT ? { role: 'assistant', content: m.content } : { role: 'user', content: m.content },
      ),
    ];

    const toolDefinitions = this.tools.getDefinitions();
    let finalText: string | null = null;

    for (let i = 0; i < MAX_TOOL_ITERATIONS && finalText === null; i++) {
      const result = await this.llm.chat(history, toolDefinitions);

      if (result.toolCalls.length === 0) {
        finalText = result.assistantText ?? 'Não consegui gerar uma resposta.';
        break;
      }

      history.push({ role: 'assistant', content: result.assistantText, toolCalls: result.toolCalls });

      for (const call of result.toolCalls) {
        let toolResultContent: string;
        try {
          toolResultContent = JSON.stringify(await this.tools.execute(call.name, call.arguments));
        } catch (error) {
          toolResultContent = JSON.stringify({ error: (error as Error).message });
        }

        history.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content: toolResultContent });
        await this.prisma.aIMessage.create({
          data: {
            conversationId: conversation.id,
            role: AIMessageRole.TOOL,
            toolName: call.name,
            content: toolResultContent,
          } as Prisma.AIMessageUncheckedCreateInput,
        });
      }
    }

    if (finalText === null) {
      finalText = 'Não consegui concluir a resposta — muitas consultas encadeadas. Tente reformular a pergunta.';
    }

    await this.prisma.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: AIMessageRole.ASSISTANT,
        content: finalText,
      } as Prisma.AIMessageUncheckedCreateInput,
    });
    await this.prisma.aIConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

    return this.getConversation(userId, conversation.id);
  }

  private async resolveConversation(userId: string, conversationId: string | undefined, text: string) {
    if (conversationId) {
      const existing = await this.prisma.aIConversation.findUnique({ where: { id: conversationId } });
      if (!existing || existing.userId !== userId) {
        throw new NotFoundException('Conversa não encontrada');
      }
      return existing;
    }
    return this.prisma.aIConversation.create({
      data: { userId, title: text.slice(0, 80) } as Prisma.AIConversationUncheckedCreateInput,
    });
  }
}
