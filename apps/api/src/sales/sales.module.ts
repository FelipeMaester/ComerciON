import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { CouponsModule } from '../coupons/coupons.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AutomationsModule } from '../automations/automations.module';
import { CashModule } from '../cash/cash.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [InventoryModule, CouponsModule, WhatsappModule, AutomationsModule, CashModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
