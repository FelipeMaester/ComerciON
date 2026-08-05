import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsString, Min, validateSync } from 'class-validator';

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
