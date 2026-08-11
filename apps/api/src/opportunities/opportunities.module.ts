import { Module } from '@nestjs/common';
import { AutomationsModule } from '../automations/automations.module';
import { OpportunitiesController, PipelineStagesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';

@Module({
  imports: [AutomationsModule],
  controllers: [OpportunitiesController, PipelineStagesController],
  providers: [OpportunitiesService],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
