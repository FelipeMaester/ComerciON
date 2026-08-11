import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

/**
 * Confirma que um POST no webhook do Twilio realmente veio do Twilio,
 * validando o header X-Twilio-Signature contra o auth token da conta e a
 * URL pública exata configurada no console (PUBLIC_API_URL) — sem isso,
 * qualquer um poderia forjar uma mensagem "recebida" nessa rota pública.
 */
@Injectable()
export class TwilioSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const publicApiUrl = this.config.get<string>('PUBLIC_API_URL');
    const signature = request.headers['x-twilio-signature'];

    if (!authToken || !publicApiUrl) {
      throw new ForbiddenException('Webhook do Twilio não está configurado (TWILIO_AUTH_TOKEN/PUBLIC_API_URL ausentes)');
    }
    if (!signature) {
      throw new ForbiddenException('Assinatura do Twilio ausente');
    }

    const url = `${publicApiUrl}${request.originalUrl}`;
    const valid = twilio.validateRequest(authToken, String(signature), url, request.body ?? {});
    if (!valid) {
      throw new ForbiddenException('Assinatura do Twilio inválida');
    }
    return true;
  }
}
