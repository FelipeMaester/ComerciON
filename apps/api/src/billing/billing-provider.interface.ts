/**
 * Cobrança recorrente DOS TENANTS — o SaaS cobrando os comerciantes que usam
 * o sistema. Não confundir com FinancialEntry, que é o financeiro do tenant
 * sobre os clientes DELE.
 *
 * O desenho anterior tinha um `charge()` que devolvia PAID ou FAILED na hora.
 * Isso não sobrevive a nenhum meio de pagamento brasileiro: boleto e PIX
 * nascem PENDENTES e são confirmados depois — minutos no PIX, dias no boleto.
 * Cartão só é síncrono com um cartão já tokenizado, e este sistema não captura
 * cartão (nem deveria, sem PCI).
 *
 * Por isso a interface é assíncrona: cria-se a cobrança, entrega-se o link ao
 * cliente, e a confirmação chega depois por webhook. Quem trata o webhook é o
 * próprio provider, porque o formato do payload é dele.
 */

export interface DadosDoPagador {
  nome: string;
  /** CPF/CNPJ. Provedores brasileiros exigem — sem isso a cobrança é recusada. */
  documento: string | null;
  email: string;
}

export interface CriarCobrancaParams {
  tenantId: string;
  amount: number;
  description: string;
  vencimento: Date;
  pagador: DadosDoPagador;
  /**
   * Id do pagador no provedor, quando já conhecido. Evita recriar o mesmo
   * cliente a cada mensalidade.
   */
  pagadorExternalId?: string | null;
}

/**
 * PENDING é o estado NORMAL de uma cobrança recém-criada, não um erro.
 * FAILED é recusa definitiva (cartão negado, cobrança cancelada/estornada).
 */
export type StatusCobranca = 'PENDING' | 'PAID' | 'FAILED';

export interface CobrancaCriada {
  externalId: string;
  status: StatusCobranca;
  /** Onde o cliente paga: fatura com boleto, PIX e cartão. */
  paymentUrl?: string;
  /** Id do pagador no provedor, para guardar e reaproveitar. */
  pagadorExternalId?: string;
}

/** O que um webhook do provedor significa, traduzido para o domínio. */
export interface EventoDeCobranca {
  externalId: string;
  status: StatusCobranca;
}

export interface BillingProvider {
  criarCobranca(params: CriarCobrancaParams): Promise<CobrancaCriada>;

  /**
   * Traduz o corpo do webhook. Devolve null para evento que não interessa —
   * o provedor manda muitos tipos, e ignorar o que não se entende é melhor
   * do que reagir a metade de um evento.
   */
  interpretarWebhook(payload: unknown): EventoDeCobranca | null;
}

export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
