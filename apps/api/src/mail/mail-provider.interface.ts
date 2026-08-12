export interface MailMessage {
  to: string;
  subject: string;
  /** Corpo em texto puro. Obrigatório: é o que aparece em cliente sem HTML e o que evita cair no spam. */
  text: string;
  html?: string;
}

/**
 * Abstração do envio de e-mail. Sem MAIL_PROVIDER=smtp configurado, o sistema
 * usa StubMailProvider, que só registra a mensagem no log — o fluxo inteiro
 * (redefinição de senha, por exemplo) continua funcionando em desenvolvimento
 * sem depender de nenhum servidor externo.
 *
 * Mesmo padrão dos provedores de WhatsApp, fiscal e cobrança: trocar de
 * implementação é mudar uma variável de ambiente, e o resto do sistema não
 * sabe qual está em uso.
 */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');
