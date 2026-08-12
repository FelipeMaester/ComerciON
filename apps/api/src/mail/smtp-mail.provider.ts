import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { MailMessage, MailProvider } from './mail-provider.interface';

export interface SmtpConfig {
  host: string;
  port: number;
  /** true = TLS direto (porta 465). false = STARTTLS (portas 587/25). */
  secure: boolean;
  user?: string;
  pass?: string;
  /** Remetente: "Loja <nao-responda@loja.com.br>" ou só o endereço. */
  from: string;
}

/**
 * Envio real por SMTP. Funciona com qualquer serviço que fale SMTP — Gmail,
 * Zoho, Amazon SES, Brevo, Resend, ou o servidor da própria hospedagem.
 */
@Injectable()
export class SmtpMailProvider implements MailProvider {
  private readonly logger = new Logger('SmtpMailProvider');
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      // Sem usuário configurado, conecta sem autenticação (servidor SMTP
      // interno ou de teste). Passar auth com user vazio faz o nodemailer
      // tentar autenticar mesmo assim e o servidor recusar a conexão.
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      this.logger.log(`E-mail enviado para ${message.to} (${info.messageId})`);
    } catch (error) {
      // A mensagem original do SMTP é o que diz o que houve de verdade
      // (autenticação recusada, domínio inexistente, porta bloqueada) — e sem
      // ela quem for investigar fica só com "não foi possível enviar".
      const reason = (error as Error).message;
      this.logger.error(`Falha ao enviar e-mail para ${message.to}: ${reason}`);
      throw new ServiceUnavailableException(`Não foi possível enviar o e-mail: ${reason}`);
    }
  }

  /** Testa a conexão/credenciais sem mandar mensagem. Usado no health check. */
  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.warn(`Servidor SMTP inacessível: ${(error as Error).message}`);
      return false;
    }
  }
}
