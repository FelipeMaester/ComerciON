import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [CommonModule],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
