export interface ChargeParams {
  tenantId: string;
  amount: number;
  description: string;
}

export interface ChargeResult {
  externalId: string;
  status: 'PAID' | 'FAILED';
}

/**
 * Abstração do provedor de cobrança recorrente DOS TENANTS (o SaaS cobrando
 * seus clientes-comerciantes) — diferente do FinancialEntry, que é o
 * financeiro do tenant sobre os clientes dele. A Fase 7 usa
 * StubBillingProvider (simulado, sempre aprova). Para produção, troque o
 * provider registrado em billing.module.ts por uma implementação real
 * (Stripe, Pagar.me, Iugu) — o resto do sistema não muda.
 */
export interface BillingProvider {
  charge(params: ChargeParams): Promise<ChargeResult>;
}

export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
