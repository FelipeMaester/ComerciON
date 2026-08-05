import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BillingProvider, ChargeParams, ChargeResult } from './billing-provider.interface';

/**
 * Implementação simulada — NÃO cobra cartão/boleto real, apenas registra no
 * log e aprova sempre, só para o fluxo de assinatura/cobrança recorrente
 * funcionar de ponta a ponta nesta fase.
 */
@Injectable()
export class StubBillingProvider implements BillingProvider {
  private readonly logger = new Logger('StubBillingProvider');

  async charge(params: ChargeParams): Promise<ChargeResult> {
    this.logger.log(`[SIMULADO] Cobrança de R$ ${params.amount.toFixed(2)} do tenant ${params.tenantId}: ${params.description}`);
    return { externalId: `stub-${randomUUID()}`, status: 'PAID' };
  }
}
