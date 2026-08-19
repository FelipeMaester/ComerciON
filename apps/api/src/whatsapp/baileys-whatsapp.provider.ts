import { Injectable } from '@nestjs/common';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { SendMessageResult, WhatsAppProvider } from './whatsapp-provider.interface';
import { SessaoWhatsappService } from './sessao-whatsapp.service';

/**
 * Envia pelo número da própria loja, usando a sessão conectada por QR Code.
 *
 * A diferença estrutural para o provedor oficial: o Twilio é UM número para a
 * instalação inteira, configurado por variável de ambiente. Aqui cada loja tem
 * o seu, então o provedor precisa saber de qual loja é a mensagem — daí o
 * contexto de tenant.
 *
 * Isso mantém a interface intacta (`sendText(to, text)`) e o resto do sistema
 * — cobranças, automações, Inbox — segue sem saber qual provedor está atrás.
 */
@Injectable()
export class BaileysWhatsAppProvider implements WhatsAppProvider {
  constructor(
    private readonly sessoes: SessaoWhatsappService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async sendText(to: string, text: string): Promise<SendMessageResult> {
    const tenantId = this.tenantContext.tenantId;
    if (!tenantId) {
      // Sem tenant não há de qual número enviar. Acontece se alguém chamar
      // isto de um job que esqueceu de entrar no contexto da loja — melhor
      // falhar dizendo o porquê do que mandar pelo número de outra pessoa.
      throw new Error('Envio sem contexto de loja — não há sessão de WhatsApp para usar');
    }
    return this.sessoes.enviar(tenantId, to, text);
  }
}
