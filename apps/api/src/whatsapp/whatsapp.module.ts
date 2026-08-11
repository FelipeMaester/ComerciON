import { Module } from '@nestjs/common';
import { WHATSAPP_PROVIDER } from './whatsapp-provider.interface';
import { StubWhatsAppProvider } from './stub-whatsapp.provider';
import { ChatbotService } from './chatbot.service';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { AutomationsService } from './automations.service';

@Module({
  controllers: [ConversationsController],
  providers: [
    { provide: WHATSAPP_PROVIDER, useClass: StubWhatsAppProvider },
    ChatbotService,
    ConversationsService,
    AutomationsService,
  ],
  exports: [AutomationsService, WHATSAPP_PROVIDER],
})
export class WhatsappModule {}
