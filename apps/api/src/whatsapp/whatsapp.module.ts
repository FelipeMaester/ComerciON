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

@Module({
  controllers: [ConversationsController],
  providers: [
    {
      provide: WHATSAPP_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('WHATSAPP_PROVIDER', 'stub');
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
  ],
  exports: [AutomationsService, WHATSAPP_PROVIDER],
})
export class WhatsappModule {}
