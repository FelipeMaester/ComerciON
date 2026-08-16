import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  BillingProvider,
  CobrancaCriada,
  CriarCobrancaParams,
  EventoDeCobranca,
} from './billing-provider.interface';

/**
 * Provedor simulado — NÃO cobra nada de verdade.
 *
 * Aprova na hora, de propósito: em desenvolvimento não existe webhook chegando
 * de lugar nenhum, e uma cobrança eternamente pendente deixaria o fluxo de
 * assinatura sem fim. É o único ponto em que o simulado se comporta diferente
 * do real, e está aqui escrito para ninguém se enganar ao ver a tela.
 */
@Injectable()
export class StubBillingProvider implements BillingProvider {
  private readonly logger = new Logger('StubBillingProvider');

  async criarCobranca(params: CriarCobrancaParams): Promise<CobrancaCriada> {
    this.logger.log(
      `[SIMULADO] Cobrança de R$ ${params.amount.toFixed(2)} do tenant ${params.tenantId}: ${params.description}`,
    );
    return { externalId: `stub-${randomUUID()}`, status: 'PAID' };
  }

  interpretarWebhook(): EventoDeCobranca | null {
    // Não existe webhook simulado: ninguém aponta um provedor de verdade para
    // cá. Se um payload chegar nesta rota com o stub ativo, é engano.
    return null;
  }
}
