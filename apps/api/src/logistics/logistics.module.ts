import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { FreightService } from './freight.service';
import { LogisticsController } from './logistics.controller';
import { ShipmentsService } from './shipments.service';

@Module({
  imports: [WhatsappModule],
  controllers: [LogisticsController],
  providers: [FreightService, ShipmentsService],
  exports: [FreightService, ShipmentsService],
})
export class LogisticsModule {}
