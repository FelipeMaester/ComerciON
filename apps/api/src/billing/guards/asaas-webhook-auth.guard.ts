import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

/**
 * Autentica o webhook do Asaas.
 *
 * O Asaas não assina o corpo: a segurança é um token que você define ao criar
 * o webhook no painel dele, devolvido em toda chamada no header
 * `asaas-access-token`. Sem esta checagem, qualquer um que descubra a URL
 * marca a própria assinatura como paga — a rota é pública por natureza.
 *
 * Se ASAAS_WEBHOOK_TOKEN não estiver configurado, a rota é RECUSADA em vez de
 * liberada. Um webhook aberto por falta de configuração é pior do que um
 * webhook que não funciona: o segundo aparece na hora, o primeiro não aparece
 * nunca.
 */
@Injectable()
export class AsaasWebhookAuthGuard implements CanActivate {
  private readonly logger = new Logger('AsaasWebhookAuthGuard');

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const esperado = this.config.get<string>('ASAAS_WEBHOOK_TOKEN');
    if (!esperado) {
      this.logger.error('ASAAS_WEBHOOK_TOKEN não configurado — webhook recusado.');
      throw new UnauthorizedException('Webhook não configurado');
    }

    const req = context.switchToHttp().getRequest<Request>();
    const recebido = req.headers['asaas-access-token'];

    if (typeof recebido !== 'string' || !comparaSegura(recebido, esperado)) {
      this.logger.warn('Webhook do Asaas recusado: token ausente ou inválido.');
      throw new UnauthorizedException('Token inválido');
    }

    return true;
  }
}

/**
 * Comparação em tempo constante. Com `===`, o tempo de resposta varia com
 * quantos caracteres iniciais batem, e isso deixa o token ser descoberto aos
 * poucos. O custo aqui é zero e a alternativa é sutil demais para arriscar.
 */
function comparaSegura(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual exige o mesmo tamanho; comprimento diferente já é recusa.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
