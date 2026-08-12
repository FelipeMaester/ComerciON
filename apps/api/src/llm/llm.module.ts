import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnthropicLlmProvider } from './anthropic-llm.provider';
import { LLM_PROVIDER } from './llm-provider.interface';
import { OpenAiLlmProvider } from './openai-llm.provider';
import { StubLlmProvider } from './stub-llm.provider';

/**
 * Camada de modelo de linguagem — hoje o único consumidor é o gerador de
 * sugestões de automação com SUGGESTION_ENGINE=ai, que é opcional e não é o
 * padrão. Continua isolada atrás de LLM_PROVIDER para que trocar de provedor
 * (ou desligar tudo, voltando ao stub) seja só mudar uma variável de ambiente.
 */
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('AI_PROVIDER', 'stub');
        if (provider === 'anthropic') {
          const apiKey = config.get<string>('ANTHROPIC_API_KEY');
          if (apiKey) return new AnthropicLlmProvider(apiKey);
        }
        if (provider === 'openai') {
          const apiKey = config.get<string>('OPENAI_API_KEY');
          if (apiKey) return new OpenAiLlmProvider(apiKey);
        }
        // AI_PROVIDER=stub, ou provider real escolhido sem a chave
        // correspondente configurada — cai no stub em vez de derrubar o boot.
        return new StubLlmProvider();
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
