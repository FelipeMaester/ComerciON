import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { DiagnosticoDeEmail, MailMessage, MailProvider } from './mail-provider.interface';

/**
 * Dez segundos para conectar, cumprimentar e conversar. Servidor de e-mail
 * saudável responde em menos de um; o que passa disso é porta bloqueada ou
 * host errado, e nesses casos falhar rápido é melhor do que insistir.
 */
const TEMPO_LIMITE_MS = 10_000;

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

      // Sem estes limites, o padrão do nodemailer espera DOIS MINUTOS antes
      // de desistir. Numa VPS isso não é hipótese: muitos provedores bloqueiam
      // a saída nas portas 25/587 por padrão, o pacote é descartado em
      // silêncio e a conexão fica pendurada. O usuário clicaria em "esqueci
      // minha senha" e olharia uma tela travada até o navegador desistir.
      connectionTimeout: TEMPO_LIMITE_MS,
      greetingTimeout: TEMPO_LIMITE_MS,
      socketTimeout: TEMPO_LIMITE_MS,
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

  async diagnosticar(): Promise<DiagnosticoDeEmail> {
    try {
      await this.transporter.verify();
      return { ok: true, provedor: 'smtp' };
    } catch (error) {
      const detalhe = (error as Error).message;
      this.logger.warn(`Servidor SMTP inacessível: ${detalhe}`);
      return { ok: false, provedor: 'smtp', detalhe };
    }
  }
}
