import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAIL_PROVIDER, MailProvider } from './mail-provider.interface';

/**
 * Monta e dispara os e-mails do sistema.
 *
 * Os textos vivem aqui, num lugar só, em vez de espalhados pelos serviços que
 * disparam o envio — quem for ajustar a redação não precisa entender o fluxo
 * de autenticação para mexer numa frase.
 */
@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    private readonly config: ConfigService,
  ) {}

  /** Minutos de validade do link — usado no texto e pelo AuthService, mesma fonte. */
  static readonly PASSWORD_RESET_TTL_MINUTES = 60;

  async sendPasswordReset(params: {
    to: string;
    userName: string;
    tenantName: string;
    tenantSlug: string;
    token: string;
  }): Promise<void> {
    const baseUrl = this.config.get<string>('WEB_APP_URL', 'http://localhost:3000').replace(/\/$/, '');
    // O slug vai no link porque a redefinição é uma rota pública: sem ele a
    // API não sabe em qual empresa procurar o token (o mesmo e-mail pode
    // existir em duas lojas diferentes).
    const link = `${baseUrl}/reset-password?token=${encodeURIComponent(params.token)}&tenant=${encodeURIComponent(params.tenantSlug)}`;
    const minutos = MailService.PASSWORD_RESET_TTL_MINUTES;

    const text = [
      `Olá, ${params.userName}.`,
      '',
      `Recebemos um pedido para redefinir a senha da sua conta em ${params.tenantName}.`,
      '',
      'Para escolher uma nova senha, acesse:',
      link,
      '',
      `Este link vale por ${minutos} minutos e só pode ser usado uma vez.`,
      '',
      'Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.',
    ].join('\n');

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;color:#1f2937;line-height:1.6;max-width:520px">
        <p>Olá, <strong>${escapeHtml(params.userName)}</strong>.</p>
        <p>Recebemos um pedido para redefinir a senha da sua conta em <strong>${escapeHtml(params.tenantName)}</strong>.</p>
        <p style="margin:28px 0">
          <a href="${escapeHtml(link)}"
             style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600">
            Escolher nova senha
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px">
          Este link vale por ${minutos} minutos e só pode ser usado uma vez.<br>
          Se o botão não funcionar, copie e cole no navegador:<br>
          <span style="word-break:break-all">${escapeHtml(link)}</span>
        </p>
        <p style="color:#6b7280;font-size:13px">
          Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.
        </p>
      </div>
    `.trim();

    await this.provider.send({
      to: params.to,
      subject: `Redefinição de senha — ${params.tenantName}`,
      text,
      html,
    });
  }

  /** Aviso de que a senha mudou — a defesa contra alguém trocar a senha sem o dono saber. */
  async sendPasswordChanged(params: { to: string; userName: string; tenantName: string }): Promise<void> {
    const text = [
      `Olá, ${params.userName}.`,
      '',
      `A senha da sua conta em ${params.tenantName} acabou de ser alterada.`,
      '',
      'Se foi você, não precisa fazer nada.',
      'Se NÃO foi você, procure o administrador da sua empresa imediatamente: alguém pode ter acesso à sua conta.',
    ].join('\n');

    await this.provider.send({
      to: params.to,
      subject: `Sua senha foi alterada — ${params.tenantName}`,
      text,
    });
  }
}

/** Impede que um nome com < ou & quebre (ou injete) HTML no corpo do e-mail. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
