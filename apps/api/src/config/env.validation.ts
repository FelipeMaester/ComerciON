import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min, validateSync } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  API_PORT: number = 3001;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_ACCESS_EXPIRES_IN!: string;

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_REFRESH_EXPIRES_IN!: string;

  @IsString()
  TENANT_HEADER: string = 'x-tenant-slug';

  @IsString()
  CORS_ORIGIN: string = 'http://localhost:3000';

  /** URL do painel — usada para montar o link de redefinição de senha. */
  @IsString()
  WEB_APP_URL: string = 'http://localhost:3000';

  // E-mail — mesmo espírito dos demais provedores: sem SMTP configurado cai
  // no stub, que só escreve a mensagem no log. Em desenvolvimento é assim que
  // se pega o link de redefinição de senha, sem servidor nenhum.
  @IsString()
  MAIL_PROVIDER: string = 'stub';

  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @IsString()
  SMTP_PORT?: string;

  /**
   * Tentativas de login por minuto, por IP (padrão 20). Suba se a loja tem
   * muita gente atrás da mesma internet; desça se o painel está exposto na
   * internet aberta. Lido direto de process.env pelo decorador do controller.
   */
  @IsOptional()
  @IsString()
  LOGIN_RATE_LIMIT?: string;

  /** Deduzido da porta (465 = true) quando não declarado. */
  @IsOptional()
  @IsString()
  SMTP_SECURE?: string;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  MAIL_FROM?: string;

  // ComerciON IA — nenhuma é obrigatória: sem chave configurada, o sistema
  // usa StubLlmProvider (avisa que a IA ainda não está configurada) em vez
  // de quebrar o boot. Ver apps/api/src/llm/.
  @IsString()
  AI_PROVIDER: string = 'stub';

  @IsOptional()
  @IsString()
  ANTHROPIC_API_KEY?: string;

  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  // Quem gera as sugestões da aba de Automações. 'rules' (padrão) usa o motor
  // determinístico do próprio sistema: lê os números agregados do banco e
  // monta as sugestões, sem chamada externa e sem custo por uso. 'ai' delega
  // ao modelo configurado acima — texto mais adaptado, mas pago por análise.
  @IsString()
  SUGGESTION_ENGINE: string = 'rules';

  // Emissão fiscal — mesmo espírito da IA e do WhatsApp: sem provedor
  // configurado cai no simulado, que NÃO emite nota de verdade. Para valer,
  // use FISCAL_PROVIDER=focusnfe + FOCUS_NFE_TOKEN.
  @IsString()
  FISCAL_PROVIDER: string = 'stub';

  @IsOptional()
  @IsString()
  FOCUS_NFE_TOKEN?: string;

  /** 'homologacao' (padrão, sem valor fiscal) ou 'producao'. */
  @IsString()
  FOCUS_NFE_ENV: string = 'homologacao';

  // WhatsApp real (Fase E) — mesmo espírito da IA: sem provider configurado,
  // cai no StubWhatsAppProvider (nunca quebra o boot). Ver
  // apps/api/src/whatsapp/whatsapp.module.ts.
  @IsString()
  WHATSAPP_PROVIDER: string = 'stub';

  @IsOptional()
  @IsString()
  TWILIO_ACCOUNT_SID?: string;

  @IsOptional()
  @IsString()
  TWILIO_AUTH_TOKEN?: string;

  @IsOptional()
  @IsString()
  TWILIO_WHATSAPP_FROM?: string;

  /**
   * Teto de mensagens automáticas por loja em 24h — freio de custo contra
   * automação mal configurada. 0 desliga. Ver WhatsappSenderService.
   */
  @IsOptional()
  @IsString()
  WHATSAPP_MAX_AUTOMATED_PER_DAY?: string;

  // URL pública da API (ex.: URL do ngrok em dev) — usada pra validar a
  // assinatura do webhook do Twilio contra a URL exata configurada lá.
  @IsOptional()
  @IsString()
  PUBLIC_API_URL?: string;

  // Cobrança da assinatura — mesmo espírito dos demais: sem provider
  // configurado cai no simulado, que aprova tudo e NÃO cobra ninguém.
  @IsString()
  BILLING_PROVIDER: string = 'stub';

  @IsOptional()
  @IsString()
  ASAAS_API_KEY?: string;

  /** 'sandbox' (padrão, cobranças de mentira) ou 'producao'. */
  @IsString()
  ASAAS_ENV: string = 'sandbox';

  /**
   * Token definido ao criar o webhook no painel do Asaas. Sem ele a rota de
   * webhook recusa tudo — um webhook aberto deixaria qualquer um marcar a
   * própria assinatura como paga.
   */
  @IsOptional()
  @IsString()
  ASAAS_WEBHOOK_TOKEN?: string;

  /** UNDEFINED deixa o cliente escolher entre boleto, PIX e cartão. */
  @IsString()
  ASAAS_BILLING_TYPE: string = 'UNDEFINED';
}

/**
 * Segredos que existem para serem trocados. Com qualquer um destes valendo em
 * produção, qualquer pessoa forja um token de admin de qualquer loja — e nada
 * no sistema daria sinal de que isso está acontecendo.
 */
const SEGREDOS_CRITICOS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;

const TAMANHO_MINIMO_SEGREDO = 32;

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Variáveis de ambiente inválidas ou ausentes:\n${errors
        .map((e) => `- ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
        .join('\n')}`,
    );
  }

  // Só em produção: em desenvolvimento os valores de exemplo são justamente o
  // que faz o projeto subir com um `cp .env.example .env`.
  if (validated.NODE_ENV === NodeEnv.Production) {
    const problemas = SEGREDOS_CRITICOS.flatMap((nome) => {
      const valor = validated[nome];
      if (valor.startsWith('troque-este')) return [`${nome} ainda está com o valor de exemplo`];
      if (valor.length < TAMANHO_MINIMO_SEGREDO) {
        return [`${nome} tem só ${valor.length} caracteres (mínimo ${TAMANHO_MINIMO_SEGREDO})`];
      }
      return [];
    });

    // Reaproveitar o mesmo segredo nos dois anula a distinção entre um token
    // de acesso (15 minutos) e um de refresh (7 dias): quem roubasse um token
    // de acesso poderia apresentá-lo como refresh e renovar indefinidamente.
    const distintos = new Set(SEGREDOS_CRITICOS.map((nome) => validated[nome]));
    if (distintos.size < SEGREDOS_CRITICOS.length) {
      problemas.push('os segredos de JWT de acesso e de refresh precisam ser diferentes entre si');
    }

    if (problemas.length > 0) {
      throw new Error(
        `Recusando subir em produção com segredos inseguros:\n${problemas.map((p) => `- ${p}`).join('\n')}\n\n` +
          'Gere um .env de produção com: ./scripts/gerar-env-producao.sh',
      );
    }
  }

  return validated;
}
