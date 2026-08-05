import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SendMessageResult, WhatsAppProvider } from './whatsapp-provider.interface';

/**
 * Implementação simulada — NÃO envia mensagem real pelo WhatsApp, apenas
 * registra no log e devolve um id de mensagem falso, só para o fluxo de
 * UI/negócio (inbox, automações) funcionar de ponta a ponta.
 */
@Injectable()
export class StubWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger('StubWhatsAppProvider');

  async sendText(to: string, text: string): Promise<SendMessageResult> {
    this.logger.log(`[SIMULADO] -> ${to}: ${text}`);
    return { externalId: `stub-${randomUUID()}` };
  }
}
