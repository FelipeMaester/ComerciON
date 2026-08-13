// class-transformer depende de reflect-metadata; na aplicação isso vem do
// main.ts, que o teste não carrega.
import 'reflect-metadata';
import { validateEnv } from './env.validation';

/** Um .env mínimo e válido, com segredos fortes e distintos. */
function envBase(overrides: Record<string, string> = {}) {
  return {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    JWT_REFRESH_EXPIRES_IN: '7d',
    ...overrides,
  };
}

describe('validateEnv', () => {
  it('aceita a configuração de desenvolvimento', () => {
    expect(() => validateEnv(envBase())).not.toThrow();
  });

  it('recusa quando falta uma variável obrigatória', () => {
    const { DATABASE_URL, ...semBanco } = envBase();
    expect(() => validateEnv(semBanco)).toThrow(/DATABASE_URL/);
  });

  describe('trava de produção', () => {
    it('recusa subir com os segredos de exemplo', () => {
      // O caminho fácil: copiar o .env.example e esquecer de trocar.
      expect(() =>
        validateEnv(
          envBase({
            NODE_ENV: 'production',
            JWT_ACCESS_SECRET: 'troque-este-segredo-de-acesso',
          }),
        ),
      ).toThrow(/valor de exemplo/);
    });

    it('recusa segredo curto demais', () => {
      expect(() => validateEnv(envBase({ NODE_ENV: 'production', JWT_REFRESH_SECRET: 'curto' }))).toThrow(
        /5 caracteres/,
      );
    });

    it('recusa quando os dois segredos de JWT são iguais', () => {
      // Com o mesmo segredo nos dois, um token de acesso (15 minutos) vale
      // como token de refresh (7 dias) e a expiração curta deixa de valer.
      const mesmo = 'x'.repeat(48);
      expect(() =>
        validateEnv(envBase({ NODE_ENV: 'production', JWT_ACCESS_SECRET: mesmo, JWT_REFRESH_SECRET: mesmo })),
      ).toThrow(/diferentes entre si/);
    });

    it('aponta a solução, não só o problema', () => {
      const erro = (() => {
        try {
          validateEnv(envBase({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'troque-este-x' }));
        } catch (e) {
          return (e as Error).message;
        }
        return '';
      })();

      expect(erro).toContain('gerar-env-producao.sh');
    });

    it('aceita produção quando os segredos são fortes e distintos', () => {
      expect(() => validateEnv(envBase({ NODE_ENV: 'production' }))).not.toThrow();
    });

    it('NÃO aplica a trava fora de produção', () => {
      // Em desenvolvimento os valores de exemplo são o que faz um
      // `cp .env.example .env` funcionar de primeira.
      expect(() =>
        validateEnv(envBase({ NODE_ENV: 'development', JWT_ACCESS_SECRET: 'troque-este-segredo-de-acesso' })),
      ).not.toThrow();
    });
  });
});
