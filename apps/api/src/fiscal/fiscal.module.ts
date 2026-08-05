import { Module } from '@nestjs/common';
import { FISCAL_PROVIDER } from './fiscal-provider.interface';
import { StubFiscalProvider } from './stub-fiscal.provider';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, { provide: FISCAL_PROVIDER, useClass: StubFiscalProvider }],
  exports: [InvoicesService],
})
export class FiscalModule {}
