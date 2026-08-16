import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsaasWebhookAuthGuard } from './asaas-webhook-auth.guard';

describe('AsaasWebhookAuthGuard', () => {
  function contexto(headers: Record<string, string | undefined>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext;
  }

  function guard(tokenConfigurado?: string) {
    const config = { get: jest.fn(() => tokenConfigurado) } as unknown as ConfigService;
    return new AsaasWebhookAuthGuard(config);
  }

  it('aceita quando o token do header bate', () => {
    expect(guard('segredo').canActivate(contexto({ 'asaas-access-token': 'segredo' }))).toBe(true);
  });

  it('recusa token errado', () => {
    expect(() => guard('segredo').canActivate(contexto({ 'asaas-access-token': 'chute' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('recusa quando o header não vem', () => {
    // Sem isso, qualquer um que descubra a URL marca a própria assinatura
    // como paga: a rota é pública por natureza.
    expect(() => guard('segredo').canActivate(contexto({}))).toThrow(UnauthorizedException);
  });

  it('RECUSA quando o token nem foi configurado, em vez de liberar', () => {
    // Liberar por falta de configuração seria a pior falha possível: um
    // webhook aberto não dá sinal nenhum, enquanto um webhook recusado
    // aparece no primeiro teste.
    expect(() => guard(undefined).canActivate(contexto({ 'asaas-access-token': 'qualquer' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('recusa token de tamanho diferente sem estourar na comparação', () => {
    // timingSafeEqual lança se os buffers têm tamanhos diferentes — o guard
    // precisa tratar isso antes, senão vira 500 em vez de 401.
    expect(() => guard('segredo-longo').canActivate(contexto({ 'asaas-access-token': 'x' }))).toThrow(
      UnauthorizedException,
    );
  });
});
