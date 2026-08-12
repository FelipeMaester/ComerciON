import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { BILLING_PROVIDER } from './billing-provider.interface';
import { StubBillingProvider } from './stub-billing.provider';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [CommonModule],
  controllers: [BillingController],
  providers: [BillingService, { provide: BILLING_PROVIDER, useClass: StubBillingProvider }],
  exports: [BillingService],
})
export class BillingModule {}
