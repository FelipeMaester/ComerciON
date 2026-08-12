import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FISCAL_PROVIDER } from './fiscal-provider.interface';
import { FocusNfeProvider } from './focus-nfe.provider';
import { StubFiscalProvider } from './stub-fiscal.provider';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    {
      provide: FISCAL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('FISCAL_PROVIDER', 'stub');
        if (provider === 'focusnfe') {
          const token = config.get<string>('FOCUS_NFE_TOKEN');
          // Homologação é o PADRÃO quando não declarado: emitir nota real por
          // engano tem consequência fiscal, emitir em homologação não tem.
          const sandbox = config.get<string>('FOCUS_NFE_ENV', 'homologacao') !== 'producao';
          if (token) return new FocusNfeProvider(token, sandbox);
        }
        // FISCAL_PROVIDER=stub, ou provedor real escolhido sem o token
        // configurado — cai no simulado em vez de derrubar o boot.
        return new StubFiscalProvider();
      },
    },
  ],
  exports: [InvoicesService],
})
export class FiscalModule {}
