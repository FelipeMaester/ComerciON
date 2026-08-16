import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommonModule } from '../common/common.module';
import { AsaasBillingProvider } from './asaas-billing.provider';
import { BILLING_PROVIDER } from './billing-provider.interface';
import { AsaasWebhookAuthGuard } from './guards/asaas-webhook-auth.guard';
import { StubBillingProvider } from './stub-billing.provider';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [CommonModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    AsaasWebhookAuthGuard,
    {
      provide: BILLING_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('BILLING_PROVIDER', 'stub');
        if (provider === 'asaas') {
          const apiKey = config.get<string>('ASAAS_API_KEY');
          if (apiKey) {
            return new AsaasBillingProvider(
              apiKey,
              config.get<string>('ASAAS_ENV', 'sandbox'),
              config.get<string>('ASAAS_BILLING_TYPE', 'UNDEFINED'),
            );
          }
        }
        // BILLING_PROVIDER=stub, ou 'asaas' sem a chave configurada: cai no
        // simulado em vez de derrubar o boot — mesmo critério dos outros
        // provedores do sistema. O simulado APROVA tudo, então quem depende
        // de cobrança real precisa conferir que a chave está no .env.
        return new StubBillingProvider();
      },
    },
  ],
  exports: [BillingService],
})
export class BillingModule {}
