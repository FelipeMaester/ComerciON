import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import {
  BillingProvider,
  CobrancaCriada,
  CriarCobrancaParams,
  EventoDeCobranca,
  StatusCobranca,
} from './billing-provider.interface';

/**
 * Cobrança real via Asaas.
 *
 * Sem SDK: são duas chamadas REST (criar cliente, criar cobrança) e um parse
 * de webhook. Uma dependência a mais custaria mais do que resolve.
 *
 * Contrato conferido na documentação oficial, não escrito de memória:
 *   POST /v3/customers  — exige name e cpfCnpj
 *   POST /v3/payments   — exige customer, billingType, value, dueDate
 *   header de autenticação: access_token
 *   webhook: header asaas-access-token, corpo { event, payment: { id, status } }
 */

const BASE_PRODUCAO = 'https://api.asaas.com/v3';
const BASE_SANDBOX = 'https://api-sandbox.asaas.com/v3';

/** Status do Asaas → o que o nosso domínio entende. */
const STATUS_ASAAS: Record<string, StatusCobranca> = {
  PENDING: 'PENDING',
  AWAITING_RISK_ANALYSIS: 'PENDING',
  // RECEIVED = pago e disponível; CONFIRMED = pago, saldo ainda não liberado.
  // Para liberar acesso ao sistema os dois valem como pago.
  RECEIVED: 'PAID',
  CONFIRMED: 'PAID',
  RECEIVED_IN_CASH: 'PAID',
  OVERDUE: 'FAILED',
  REFUNDED: 'FAILED',
  CHARGEBACK_REQUESTED: 'FAILED',
  CHARGEBACK_DISPUTE: 'FAILED',
};

/** Eventos que mudam o que sabemos sobre a cobrança. */
const EVENTOS_RELEVANTES = new Set([
  'PAYMENT_RECEIVED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_REFUNDED',
]);

interface RespostaCliente {
  id: string;
}

interface RespostaCobranca {
  id: string;
  status: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
}

@Injectable()
export class AsaasBillingProvider implements BillingProvider {
  private readonly logger = new Logger('AsaasBillingProvider');
  private readonly base: string;

  constructor(
    private readonly apiKey: string,
    ambiente: string,
    /**
     * UNDEFINED deixa o pagador escolher entre boleto, PIX e cartão na própria
     * fatura — é o que evita ter que pedir dados de cartão dentro do sistema.
     */
    private readonly billingType: string = 'UNDEFINED',
  ) {
    this.base = ambiente === 'producao' ? BASE_PRODUCAO : BASE_SANDBOX;
  }

  async criarCobranca(params: CriarCobrancaParams): Promise<CobrancaCriada> {
    const pagadorId = params.pagadorExternalId ?? (await this.criarPagador(params));

    const cobranca = await this.chamar<RespostaCobranca>('/payments', {
      customer: pagadorId,
      billingType: this.billingType,
      value: Number(params.amount.toFixed(2)),
      // O Asaas espera a data pura, sem hora nem fuso. Mandar ISO completo
      // faz a cobrança nascer com vencimento um dia fora dependendo do fuso.
      dueDate: formatarData(params.vencimento),
      description: params.description,
      externalReference: params.tenantId,
    });

    return {
      externalId: cobranca.id,
      status: STATUS_ASAAS[cobranca.status] ?? 'PENDING',
      // invoiceUrl é a fatura com todas as formas de pagamento; bankSlipUrl é
      // só o boleto, e serve de reserva caso a fatura não venha.
      paymentUrl: cobranca.invoiceUrl ?? cobranca.bankSlipUrl,
      pagadorExternalId: pagadorId,
    };
  }

  private async criarPagador(params: CriarCobrancaParams): Promise<string> {
    if (!params.pagador.documento) {
      // Falha explicando o que fazer: o Asaas recusa cliente sem CPF/CNPJ, e
      // um "erro 400 da API" sem contexto mandaria alguém investigar a
      // integração quando o que falta é um cadastro.
      throw new InternalServerErrorException(
        'A loja não tem CNPJ cadastrado, e o Asaas exige CPF/CNPJ para emitir cobrança. ' +
          'Preencha o documento da loja antes de contratar um plano pago.',
      );
    }

    const cliente = await this.chamar<RespostaCliente>('/customers', {
      name: params.pagador.nome,
      cpfCnpj: apenasDigitos(params.pagador.documento),
      email: params.pagador.email,
      // Amarra o cliente do Asaas ao nosso tenant, para conciliar depois.
      externalReference: params.tenantId,
    });

    return cliente.id;
  }

  interpretarWebhook(payload: unknown): EventoDeCobranca | null {
    if (!payload || typeof payload !== 'object') return null;
    const corpo = payload as { event?: unknown; payment?: { id?: unknown; status?: unknown } };

    if (typeof corpo.event !== 'string' || !EVENTOS_RELEVANTES.has(corpo.event)) return null;

    const id = corpo.payment?.id;
    if (typeof id !== 'string') return null;

    // PAYMENT_DELETED não traz um status de pagamento útil — a cobrança deixou
    // de existir, e para nós isso é o mesmo que não paga.
    if (corpo.event === 'PAYMENT_DELETED') return { externalId: id, status: 'FAILED' };

    const status = typeof corpo.payment?.status === 'string' ? STATUS_ASAAS[corpo.payment.status] : undefined;
    if (!status) return null;

    return { externalId: id, status };
  }

  private async chamar<T>(caminho: string, corpo: Record<string, unknown>): Promise<T> {
    const resposta = await fetch(`${this.base}${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', access_token: this.apiKey },
      body: JSON.stringify(corpo),
    });

    const texto = await resposta.text();

    if (!resposta.ok) {
      // A mensagem do Asaas vem em errors[].description e é específica ("CPF
      // inválido", "valor abaixo do mínimo"). Perdê-la transformaria toda
      // falha num "erro 400" indistinguível.
      const detalhe = extrairErro(texto) ?? texto.slice(0, 300);
      this.logger.error(`Asaas ${caminho} respondeu ${resposta.status}: ${detalhe}`);
      throw new InternalServerErrorException(`Provedor de cobrança recusou a operação: ${detalhe}`);
    }

    return JSON.parse(texto) as T;
  }
}

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

function extrairErro(texto: string): string | null {
  try {
    const corpo = JSON.parse(texto) as { errors?: { description?: string }[] };
    const descricoes = corpo.errors?.map((e) => e.description).filter(Boolean);
    return descricoes?.length ? descricoes.join('; ') : null;
  } catch {
    return null;
  }
}
