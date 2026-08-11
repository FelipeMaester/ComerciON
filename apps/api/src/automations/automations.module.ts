import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationRulesController } from './automation-rules.controller';
import { AutomationRulesService } from './automation-rules.service';

@Module({
  imports: [TasksModule, WhatsappModule],
  controllers: [AutomationRulesController],
  providers: [AutomationRulesService, AutomationEngineService],
  exports: [AutomationEngineService],
})
export class AutomationsModule {}
