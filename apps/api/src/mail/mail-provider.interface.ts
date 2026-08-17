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
/** Resultado de uma checagem de saúde do envio de e-mail. */
export interface DiagnosticoDeEmail {
  /** false = configurado para enviar de verdade, mas o servidor não responde. */
  ok: boolean;
  /** 'stub' avisa que NADA é enviado — não é erro, mas também não é entrega. */
  provedor: 'stub' | 'smtp';
  detalhe?: string;
}

export interface MailProvider {
  send(message: MailMessage): Promise<void>;

  /**
   * Testa conexão e credenciais SEM mandar mensagem.
   *
   * Existe porque e-mail quebrado é invisível: o "esqueci minha senha"
   * responde 200 de qualquer jeito (para não revelar quais e-mails existem),
   * e o erro fica só no log. Sem uma checagem que o monitoramento consiga
   * ler, a primeira notícia vem de alguém que não conseguiu entrar.
   */
  diagnosticar(): Promise<DiagnosticoDeEmail>;
}

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');
