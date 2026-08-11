import { Injectable } from '@nestjs/common';
import twilio from 'twilio';
import { SendMessageResult, WhatsAppProvider } from './whatsapp-provider.interface';
import { toE164Br } from './phone-format.util';

@Injectable()
export class TwilioWhatsAppProvider implements WhatsAppProvider {
  private readonly client: ReturnType<typeof twilio>;

  constructor(
    accountSid: string,
    authToken: string,
    private readonly from: string,
  ) {
    this.client = twilio(accountSid, authToken);
  }

  async sendText(to: string, text: string): Promise<SendMessageResult> {
    const message = await this.client.messages.create({
      from: this.from,
      to: `whatsapp:${toE164Br(to)}`,
      body: text,
    });
    return { externalId: message.sid };
  }
}
