import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { CouponsModule } from '../coupons/coupons.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { SettingsModule } from '../settings/settings.module';
import { QuotesModule } from '../quotes/quotes.module';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

@Module({
  imports: [SalesModule, CouponsModule, LogisticsModule, SettingsModule, QuotesModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
