import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_PROVIDER } from './mail-provider.interface';
import { MailService } from './mail.service';
import { SmtpMailProvider } from './smtp-mail.provider';
import { StubMailProvider } from './stub-mail.provider';

/**
 * Global porque e-mail é infraestrutura transversal: autenticação hoje,
 * qualquer módulo amanhã. Marcar aqui evita ter que lembrar de importar
 * MailModule em cada módulo que um dia precise avisar alguém.
 */
@Global()
@Module({
  providers: [
    {
      provide: MAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('MailModule');
        const provider = config.get<string>('MAIL_PROVIDER', 'stub');

        if (provider === 'smtp') {
          const host = config.get<string>('SMTP_HOST');
          if (host) {
            const port = Number(config.get('SMTP_PORT', 587));
            return new SmtpMailProvider({
              host,
              port,
              // Porta 465 é TLS direto; 587 e 25 usam STARTTLS. Deduzir da
              // porta acerta na configuração de praticamente todo provedor e
              // evita mais uma variável para errar — mas SMTP_SECURE ainda
              // manda, se estiver declarada.
              secure: config.get<string>('SMTP_SECURE')
                ? config.get<string>('SMTP_SECURE') === 'true'
                : port === 465,
              user: config.get<string>('SMTP_USER'),
              pass: config.get<string>('SMTP_PASSWORD'),
              from: config.get<string>('MAIL_FROM', 'ComerciON <nao-responda@localhost>'),
            });
          }
          logger.warn('MAIL_PROVIDER=smtp mas SMTP_HOST não foi configurado — os e-mails só serão registrados no log.');
        }

        // Padrão: nada é enviado de verdade, o conteúdo vai para o log. Nunca
        // derruba o boot por falta de configuração de e-mail.
        return new StubMailProvider();
      },
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
