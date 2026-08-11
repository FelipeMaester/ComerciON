import { Injectable } from '@nestjs/common';
import { LLMChatMessage, LLMChatResult, LLMProvider, LLMToolDefinition } from './llm-provider.interface';

/**
 * Implementação simulada — usada quando AI_PROVIDER=stub (padrão, ver
 * env.validation.ts) ou quando nenhuma chave de API foi configurada. Nunca
 * chama tool nenhuma, só avisa que a IA ainda não está ativada, pro
 * encanamento (rota -> service -> provider -> persistência -> frontend)
 * funcionar de ponta a ponta mesmo sem nenhum provedor real plugado ainda.
 */
@Injectable()
export class StubLlmProvider implements LLMProvider {
  async chat(_messages: LLMChatMessage[], _tools: LLMToolDefinition[]): Promise<LLMChatResult> {
    return {
      assistantText:
        'A ComerciON IA ainda não está configurada. Peça pra quem administra o sistema definir AI_PROVIDER e a chave de API (Anthropic ou OpenAI) nas variáveis de ambiente.',
      toolCalls: [],
    };
  }
}
