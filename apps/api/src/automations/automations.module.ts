import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_PROVIDER, LLMProvider } from '../llm/llm-provider.interface';
import { LlmModule } from '../llm/llm.module';
import { TasksModule } from '../tasks/tasks.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationRulesController } from './automation-rules.controller';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationSuggestionsService } from './automation-suggestions.service';
import { BusinessSnapshotService } from './business-snapshot.service';
import { AiSuggestionGenerator } from './suggestions/ai-suggestion.generator';
import { RuleBasedSuggestionGenerator } from './suggestions/rule-based-suggestion.generator';
import { SUGGESTION_GENERATOR } from './suggestions/suggestion-generator.interface';

@Module({
  imports: [TasksModule, WhatsappModule, LlmModule],
  controllers: [AutomationRulesController],
  providers: [
    AutomationRulesService,
    AutomationSuggestionsService,
    AutomationEngineService,
    BusinessSnapshotService,
    RuleBasedSuggestionGenerator,
    {
      provide: SUGGESTION_GENERATOR,
      inject: [ConfigService, RuleBasedSuggestionGenerator, LLM_PROVIDER],
      useFactory: (config: ConfigService, rules: RuleBasedSuggestionGenerator, llm: LLMProvider) => {
        // Padrão deliberado: motor de REGRAS. Ele lê os mesmos números
        // agregados do banco e monta as sugestões direto, sem chamada externa
        // e sem custo por uso. A IA só entra se for pedida explicitamente.
        if (config.get<string>('SUGGESTION_ENGINE', 'rules') === 'ai') {
          return new AiSuggestionGenerator(llm);
        }
        return rules;
      },
    },
  ],
  exports: [AutomationEngineService],
})
export class AutomationsModule {}
