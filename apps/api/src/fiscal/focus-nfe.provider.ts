import { Logger } from '@nestjs/common';
import { InvoiceType, PaymentMethod } from '@prisma/client';
import {
  FiscalProvider,
  FiscalProviderError,
  IssueInvoiceParams,
  IssueInvoiceResult,
} from './fiscal-provider.interface';

const PRODUCTION_BASE = 'https://api.focusnfe.com.br/v2';
const SANDBOX_BASE = 'https://homologacao.focusnfe.com.br/v2';

/**
 * Códigos de forma de pagamento da SEFAZ (tabela do manual da NF-e).
 * Vão no campo `forma_pagamento` de cada item de `formas_pagamento`.
 */
const SEFAZ_PAYMENT_CODE: Record<PaymentMethod, string> = {
  CASH: '01', // dinheiro
  CREDIT_CARD: '03',
  DEBIT_CARD: '04',
  PIX: '17',
  BOLETO: '15',
};

/** Resposta do Focus, nos campos que usamos. */
interface FocusResponse {
  status?: string;
  status_sefaz?: string;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  numero?: string;
  serie?: string;
  caminho_danfe?: string;
  caminho_xml_nota_fiscal?: string;
  numero_protocolo?: string;
  protocolo?: string;
  erros?: { campo?: string; mensagem?: string }[];
  mensagem?: string;
}

/**
 * Integração real com o Focus NFe (NF-e modelo 55 e NFC-e modelo 65).
 *
 * Contrato conferido na documentação oficial (doc.focusnfe.com.br), não de
 * memória:
 *   - POST {base}/nfce?ref=... e {base}/nfe?ref=...
 *   - Autenticação HTTP Basic: token como usuário, senha em branco
 *   - Consulta: GET {base}/nfce/{ref}
 *   - Cancelamento: DELETE {base}/nfce/{ref} com { justificativa } de 15 a 255 caracteres
 *   - status: 'autorizado' | 'erro_autorizacao' | 'denegado' | 'processando_autorizacao'
 *
 * Emissão de NFC-e é síncrona; NF-e pode voltar como 'processando_autorizacao'
 * e é resolvida por consulta (ver waitForAuthorization).
 *
 * Sem SDK: é uma REST simples e uma dependência a menos para manter.
 */
export class FocusNfeProvider implements FiscalProvider {
  private readonly logger = new Logger('FocusNfeProvider');
  private readonly baseUrl: string;

  constructor(
    private readonly token: string,
    sandbox: boolean,
  ) {
    this.baseUrl = sandbox ? SANDBOX_BASE : PRODUCTION_BASE;
    if (sandbox) {
      this.logger.warn('Focus NFe em HOMOLOGAÇÃO — as notas emitidas NÃO têm valor fiscal.');
    }
  }

  async issue(params: IssueInvoiceParams): Promise<IssueInvoiceResult> {
    const path = params.type === InvoiceType.NFCE ? 'nfce' : 'nfe';
    const body = this.buildPayload(params);

    let data = await this.request<FocusResponse>('POST', `${path}?ref=${encodeURIComponent(params.ref)}`, body);

    // NF-e pode entrar na fila da SEFAZ; NFC-e é síncrona e cai fora deste laço.
    if (data.status === 'processando_autorizacao') {
      data = await this.waitForAuthorization(path, params.ref);
    }

    if (data.status !== 'autorizado') {
      throw new FiscalProviderError(
        this.describeFailure(data),
        data.status_sefaz,
        data.mensagem_sefaz ?? data.mensagem,
      );
    }

    return {
      accessKey: data.chave_nfe ?? '',
      series: data.serie ?? '',
      number: data.numero ?? '',
      danfeUrl: this.absolute(data.caminho_danfe),
      xmlUrl: this.absolute(data.caminho_xml_nota_fiscal),
      protocol: data.numero_protocolo ?? data.protocolo,
      sefazStatus: data.status_sefaz,
      sefazMessage: data.mensagem_sefaz,
    };
  }

  async cancel(ref: string, _accessKey: string, reason: string): Promise<void> {
    // A SEFAZ exige justificativa de 15 a 255 caracteres. Barrar aqui dá uma
    // mensagem clara em vez de uma rejeição críptica vinda do fisco.
    if (reason.trim().length < 15) {
      throw new FiscalProviderError('A justificativa de cancelamento precisa ter pelo menos 15 caracteres.');
    }

    const data = await this.request<FocusResponse>('DELETE', `nfce/${encodeURIComponent(ref)}`, {
      justificativa: reason.trim().slice(0, 255),
    });

    if (data.status !== 'cancelado') {
      throw new FiscalProviderError(this.describeFailure(data), data.status_sefaz, data.mensagem_sefaz);
    }
  }

  /**
   * Consulta em intervalos até a SEFAZ concluir. O laço é curto e limitado de
   * propósito: quem está no balcão espera segundos, não minutos. Estourando o
   * limite, a nota pode ter sido autorizada depois — por isso a mensagem manda
   * consultar em vez de sugerir emitir de novo, que geraria nota duplicada.
   */
  private async waitForAuthorization(path: string, ref: string): Promise<FocusResponse> {
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const data = await this.request<FocusResponse>('GET', `${path}/${encodeURIComponent(ref)}`);
      if (data.status !== 'processando_autorizacao') return data;
    }
    throw new FiscalProviderError(
      'A SEFAZ ainda está processando esta nota. Consulte a venda em instantes — NÃO emita novamente, para não duplicar.',
    );
  }

  private buildPayload(params: IssueInvoiceParams): Record<string, unknown> {
    return {
      cnpj_emitente: onlyDigits(params.emitter.cnpj),
      data_emissao: params.issuedAt.toISOString(),
      natureza_operacao: 'Venda de mercadoria',
      // 1 = operação presencial (balcão). 9 seria "não presencial, outros".
      presenca_comprador: '1',
      // 9 = sem frete.
      modalidade_frete: '9',
      // 1 = operação interna (dentro do estado).
      local_destino: '1',
      ...(params.recipient?.document
        ? { cpf_destinatario: onlyDigits(params.recipient.document), nome_destinatario: params.recipient.name }
        : {}),
      ...(params.recipient?.email ? { email_destinatario: params.recipient.email } : {}),
      items: params.items.map((item, index) => ({
        numero_item: index + 1,
        codigo_produto: item.productCode,
        descricao: item.description,
        codigo_ncm: onlyDigits(item.ncm),
        cfop: onlyDigits(item.cfop),
        unidade_comercial: item.unit,
        unidade_tributavel: item.unit,
        quantidade_comercial: item.quantity,
        quantidade_tributavel: item.quantity,
        valor_unitario_comercial: round2(item.unitPrice),
        valor_unitario_tributavel: round2(item.unitPrice),
        valor_bruto: round2(item.totalPrice),
        icms_origem: item.icmsOrigin,
        icms_situacao_tributaria: item.icmsCst,
      })),
      formas_pagamento: params.payments.map((p) => ({
        forma_pagamento: SEFAZ_PAYMENT_CODE[p.method] ?? '99',
        valor_pagamento: round2(p.amount),
      })),
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    // Basic auth com o token como usuário e senha vazia — formato do Focus.
    const auth = Buffer.from(`${this.token}:`).toString('base64');

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/${path}`, {
        method,
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      // Rede fora do ar não é rejeição fiscal — a nota simplesmente não saiu.
      throw new FiscalProviderError(`Não foi possível falar com o provedor fiscal: ${(error as Error).message}`);
    }

    const text = await response.text();
    let data: T;
    try {
      data = text ? (JSON.parse(text) as T) : ({} as T);
    } catch {
      throw new FiscalProviderError(`Resposta inesperada do provedor fiscal (HTTP ${response.status}).`);
    }

    // 4xx do Focus traz o motivo no corpo, no mesmo formato — deixamos passar
    // para o chamador montar a mensagem completa a partir de `erros`.
    if (!response.ok && response.status >= 500) {
      throw new FiscalProviderError(`Provedor fiscal indisponível (HTTP ${response.status}).`);
    }
    return data;
  }

  /** Junta os erros de validação do Focus numa frase que resolve o problema. */
  private describeFailure(data: FocusResponse): string {
    if (data.erros?.length) {
      return data.erros.map((e) => [e.campo, e.mensagem].filter(Boolean).join(': ')).join(' | ');
    }
    return data.mensagem_sefaz ?? data.mensagem ?? `Emissão recusada (status: ${data.status ?? 'desconhecido'}).`;
  }

  /** O Focus devolve caminhos relativos; a URL usável precisa do host. */
  private absolute(path?: string): string | undefined {
    if (!path) return undefined;
    if (path.startsWith('http')) return path;
    return `${this.baseUrl.replace('/v2', '')}${path}`;
  }
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
