import { InvoiceType } from '@prisma/client';

export interface IssueInvoiceParams {
  type: InvoiceType;
  saleId: string;
  totalAmount: number;
  customerDocument?: string;
  customerName?: string;
}

export interface IssueInvoiceResult {
  accessKey: string;
  series: string;
  number: string;
  xmlContent: string;
}

/**
 * Abstração do provedor de emissão fiscal. A Fase 4 usa StubFiscalProvider
 * (simulado — sem integração real com SEFAZ). Para ir a produção, troque o
 * provider registrado em fiscal.module.ts por uma implementação real
 * (ex.: Focus NFe, eNotas) que chame a API REST do provedor — o resto do
 * sistema (InvoicesService, controller, telas) não muda.
 */
export interface FiscalProvider {
  issue(params: IssueInvoiceParams): Promise<IssueInvoiceResult>;
  cancel(accessKey: string, reason: string): Promise<void>;
}

export const FISCAL_PROVIDER = Symbol('FISCAL_PROVIDER');
