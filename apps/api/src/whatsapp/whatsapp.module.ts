import { AprovacaoController } from './aprovacao.controller';
import { AprovacaoService } from './aprovacao.service';
import { BaileysWhatsAppProvider } from './baileys-whatsapp.provider';
import { ConexaoController } from './conexao.controller';
import { SessaoWhatsappService } from './sessao-whatsapp.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WHATSAPP_PROVIDER } from './whatsapp-provider.interface';
import { StubWhatsAppProvider } from './stub-whatsapp.provider';
import { TwilioWhatsAppProvider } from './twilio-whatsapp.provider';
import { TwilioSignatureGuard } from './guards/twilio-signature.guard';
import { ChatbotService } from './chatbot.service';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { AutomationsService } from './automations.service';
import { WhatsappSenderService } from './whatsapp-sender.service';

@Module({
  controllers: [ConversationsController, AprovacaoController, ConexaoController],
  providers: [
    {
      provide: WHATSAPP_PROVIDER,
      inject: [ConfigService, SessaoWhatsappService, TenantContextService],
      useFactory: (config: ConfigService, sessoes: SessaoWhatsappService, tenantContext: TenantContextService) => {
        const provider = config.get<string>('WHATSAPP_PROVIDER', 'stub');

        // Sessão da própria loja, conectada por QR. Diferente dos outros, não
        // depende de credencial em variável de ambiente: quem autoriza é o
        // lojista, na tela, lendo o código com o celular.
        if (provider === 'sessao') return new BaileysWhatsAppProvider(sessoes, tenantContext);

        if (provider === 'twilio') {
          const accountSid = config.get<string>('TWILIO_ACCOUNT_SID');
          const authToken = config.get<string>('TWILIO_AUTH_TOKEN');
          const from = config.get<string>('TWILIO_WHATSAPP_FROM');
          if (accountSid && authToken && from) return new TwilioWhatsAppProvider(accountSid, authToken, from);
        }
        // WHATSAPP_PROVIDER=stub, ou provider real escolhido sem as
        // credenciais correspondentes configuradas — cai no stub em vez de
        // derrubar o boot.
        return new StubWhatsAppProvider();
      },
    },
    TwilioSignatureGuard,
    ChatbotService,
    ConversationsService,
    AutomationsService,
    WhatsappSenderService,
    AprovacaoService,
    SessaoWhatsappService,
  ],
  exports: [AutomationsService, WhatsappSenderService, AprovacaoService, SessaoWhatsappService, WHATSAPP_PROVIDER],
})
export class WhatsappModule {}
