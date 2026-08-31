import { InvoiceType, PaymentMethod } from '@prisma/client';

/**
 * Emitente da nota.
 *
 * Só o CNPJ, de propósito. Inscrição estadual, endereço, regime tributário e
 * certificado digital A1 ficam cadastrados NO PROVEDOR, por empresa — é assim
 * que o Focus NFe funciona, e provavelmente qualquer outro: esses dados mudam
 * pouco, exigem o certificado, e não faz sentido trafegá-los a cada venda.
 */
export interface InvoiceEmitter {
  cnpj: string;
}

/** Destinatário. Tudo opcional: no balcão, a maioria das vendas é sem identificação. */
export interface InvoiceRecipient {
  document?: string;
  name?: string;
  email?: string;
}

/**
 * Um item da nota, com os dados tributários que a SEFAZ exige.
 *
 * Estes campos NÃO são detalhe de implementação de um provedor específico —
 * são exigência legal. Qualquer provedor real vai pedir os mesmos, com nomes
 * diferentes. Por isso ficam na interface, e não escondidos no adaptador.
 */
export interface InvoiceLineItem {
  productCode: string;
  description: string;
  /** Nomenclatura Comum do Mercosul, 8 dígitos. */
  ncm: string;
  /** Código Fiscal de Operações, 4 dígitos. */
  cfop: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  /** 0 = nacional, 1 = importado… */
  icmsOrigin: string;
  /** CST (regime normal) ou CSOSN (Simples Nacional). */
  icmsCst: string;
}

export interface InvoicePayment {
  method: PaymentMethod;
  amount: number;
}

export interface IssueInvoiceParams {
  type: InvoiceType;
  /**
   * Referência única no nosso sistema. É a chave de idempotência: reenviar a
   * mesma referência não deve gerar uma segunda nota. Sem isso, um timeout de
   * rede seguido de nova tentativa emitiria duas notas para a mesma venda.
   */
  ref: string;
  emitter: InvoiceEmitter;
  recipient?: InvoiceRecipient;
  items: InvoiceLineItem[];
  payments: InvoicePayment[];
  totalAmount: number;
  issuedAt: Date;
}

export interface IssueInvoiceResult {
  accessKey: string;
  series: string;
  number: string;
  /** URL do PDF da DANFE, quando o provedor devolve uma. */
  danfeUrl?: string;
  /** URL do XML autorizado — o documento que precisa ser guardado por 5 anos. */
  xmlUrl?: string;
  /** Conteúdo do XML, para provedores que devolvem o arquivo em vez de uma URL. */
  xmlContent?: string;
  protocol?: string;
  sefazStatus?: string;
  sefazMessage?: string;
}

/**
 * Falha de emissão vinda da SEFAZ ou do provedor.
 *
 * Erro fiscal quase nunca é bug: é dado faltando ou errado (NCM inválido, CFOP
 * incompatível, certificado vencido). A mensagem da SEFAZ é o que resolve o
 * problema, então ela precisa chegar inteira até quem está no balcão em vez de
 * virar um "erro interno" genérico.
 */
export class FiscalProviderError extends Error {
  constructor(
    message: string,
    readonly sefazStatus?: string,
    readonly sefazMessage?: string,
  ) {
    super(message);
    this.name = 'FiscalProviderError';
  }
}

/**
 * Abstração do provedor de emissão fiscal — mesmo padrão do WhatsAppProvider e
 * do LLMProvider: o resto do sistema nunca fala com a SEFAZ nem com o provedor
 * diretamente, só com esta interface.
 *
 * Implementações:
 *   - StubFiscalProvider (padrão): simula, NÃO emite nota de verdade.
 *   - FocusNfeProvider: integração real, ligada por FISCAL_PROVIDER=focusnfe.
 */
/**
 * Em que mundo a emissão acontece.
 *
 * A tela de venda dizia "Emissão simulada nesta fase" fixo no código, escrito
 * quando só existia o simulado. Depois entrou o provedor real — e a frase
 * continuou lá. Uma loja emitindo NF-e de verdade, com valor legal, lia na
 * tela que aquilo era simulação.
 *
 * É o único lugar do sistema onde acreditar na tela errada tem consequência
 * fora dele: nota emitida por engano não se desfaz apagando um registro.
 */
export type ModoFiscal = 'simulado' | 'homologacao' | 'producao';

export interface FiscalProvider {
  /** O que dizer ao lojista antes de ele apertar "Emitir". */
  modo(): ModoFiscal;
  issue(params: IssueInvoiceParams): Promise<IssueInvoiceResult>;
  /** `ref` é a mesma referência usada na emissão; `accessKey` serve a provedores que a exigem. */
  cancel(ref: string, accessKey: string, reason: string): Promise<void>;
}

export const FISCAL_PROVIDER = Symbol('FISCAL_PROVIDER');
