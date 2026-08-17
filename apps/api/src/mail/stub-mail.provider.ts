import { Injectable, Logger } from '@nestjs/common';
import { DiagnosticoDeEmail, MailMessage, MailProvider } from './mail-provider.interface';

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

  async diagnosticar(): Promise<DiagnosticoDeEmail> {
    // ok: true porque o simulado não está quebrado — faz exatamente o que
    // promete. Quem lê precisa saber é que NADA sai daqui, e isso vem no
    // campo 'provedor', não num falso alarme.
    return {
      ok: true,
      provedor: 'stub',
      detalhe: 'Nenhum e-mail é enviado de verdade (MAIL_PROVIDER=stub).',
    };
  }
}
