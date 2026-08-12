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

  // Segredos totalmente separados dos de staff acima — um token de cliente
  // da loja (Fase 3) nunca deve poder ser validado como token de equipe.
  @IsString()
  CUSTOMER_JWT_ACCESS_SECRET!: string;

  @IsString()
  CUSTOMER_JWT_ACCESS_EXPIRES_IN!: string;

  @IsString()
  CUSTOMER_JWT_REFRESH_SECRET!: string;

  @IsString()
  CUSTOMER_JWT_REFRESH_EXPIRES_IN!: string;

  @IsString()
  TENANT_HEADER: string = 'x-tenant-slug';

  @IsString()
  CORS_ORIGIN: string = 'http://localhost:3000';

  @IsString()
  STOREFRONT_CORS_ORIGIN: string = 'http://localhost:3002';

  /** URL do painel admin — link de redefinição de senha da EQUIPE. */
  @IsString()
  WEB_APP_URL: string = 'http://localhost:3000';

  /** URL da loja virtual — link de redefinição de senha do CLIENTE final. */
  @IsString()
  STOREFRONT_URL: string = 'http://localhost:3002';

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

  // URL pública da API (ex.: URL do ngrok em dev) — usada pra validar a
  // assinatura do webhook do Twilio contra a URL exata configurada lá.
  @IsOptional()
  @IsString()
  PUBLIC_API_URL?: string;
}

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

  return validated;
}
