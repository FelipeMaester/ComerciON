import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const mockValidateRequest = jest.fn();

jest.mock('twilio', () => {
  const fn = jest.fn();
  (fn as unknown as { validateRequest: jest.Mock }).validateRequest = mockValidateRequest;
  return fn;
});

import { TwilioSignatureGuard } from './twilio-signature.guard';

describe('TwilioSignatureGuard', () => {
  let guard: TwilioSignatureGuard;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let config: any;

  function makeContext(request: Record<string, unknown>): ExecutionContext {
    return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    mockValidateRequest.mockReset();
    config = {
      get: (key: string) =>
        ({ TWILIO_AUTH_TOKEN: 'token-123', PUBLIC_API_URL: 'https://example.ngrok.io' })[key],
    };
    guard = new TwilioSignatureGuard(config as unknown as ConfigService);
  });

  it('rejeita quando TWILIO_AUTH_TOKEN/PUBLIC_API_URL não estão configurados', () => {
    config.get = () => undefined;
    expect(() => guard.canActivate(makeContext({ headers: {}, body: {} }))).toThrow(ForbiddenException);
  });

  it('rejeita quando o header X-Twilio-Signature está ausente', () => {
    expect(() => guard.canActivate(makeContext({ headers: {}, body: {} }))).toThrow(ForbiddenException);
  });

  it('rejeita quando a assinatura é inválida', () => {
    mockValidateRequest.mockReturnValue(false);
    expect(() =>
      guard.canActivate(
        makeContext({ headers: { 'x-twilio-signature': 'bad-sig' }, body: { From: 'whatsapp:+123' }, originalUrl: '/api/whatsapp/webhook/twilio' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('libera quando a assinatura é válida, chamando validateRequest com a URL pública completa', () => {
    mockValidateRequest.mockReturnValue(true);
    const request = {
      headers: { 'x-twilio-signature': 'good-sig' },
      body: { From: 'whatsapp:+123' },
      originalUrl: '/api/whatsapp/webhook/twilio?tenant=demo',
    };

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(mockValidateRequest).toHaveBeenCalledWith(
      'token-123',
      'good-sig',
      'https://example.ngrok.io/api/whatsapp/webhook/twilio?tenant=demo',
      { From: 'whatsapp:+123' },
    );
  });
});
