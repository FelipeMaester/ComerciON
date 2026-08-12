import { Injectable, Logger } from '@nestjs/common';
import { MailMessage, MailProvider } from './mail-provider.interface';

/**
 * Implementação simulada — NÃO envia e-mail de verdade, só registra no log.
 *
 * O corpo em texto vai inteiro para o log de propósito: em desenvolvimento é
 * assim que se pega o link de redefinição de senha sem precisar de servidor
 * SMTP nenhum.
 */
@Injectable()
export class StubMailProvider implements MailProvider {
  private readonly logger = new Logger('StubMailProvider');

  async send(message: MailMessage): Promise<void> {
    this.logger.log(
      `[SIMULADO] E-mail para ${message.to} — "${message.subject}"\n${message.text}`,
    );
  }
}
