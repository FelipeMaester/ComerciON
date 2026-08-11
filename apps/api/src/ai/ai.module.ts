import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DashboardService } from '../reports/dashboard.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AnthropicLlmProvider } from './llm/anthropic-llm.provider';
import { LLM_PROVIDER } from './llm/llm-provider.interface';
import { OpenAiLlmProvider } from './llm/openai-llm.provider';
import { StubLlmProvider } from './llm/stub-llm.provider';
import { AiToolsService } from './tools/ai-tools.service';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    AiToolsService,
    DashboardService,
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
})
export class AiModule {}
