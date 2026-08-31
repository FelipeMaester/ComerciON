import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, InvoiceType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FISCAL_PROVIDER,
  FiscalProvider,
  FiscalProviderError,
  InvoiceLineItem,
} from './fiscal-provider.interface';

/** Padrões para quem não preencheu o item: venda de mercadoria dentro do estado. */
const DEFAULT_CFOP = '5102';
const DEFAULT_ICMS_ORIGIN = '0';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FISCAL_PROVIDER) private readonly fiscalProvider: FiscalProvider,
  ) {}

  /**
   * Em que mundo este sistema emite — para a tela poder avisar antes do clique.
   *
   * Sai do próprio provedor injetado, e não de uma variável lida de novo aqui:
   * duas leituras da mesma configuração acabam divergindo, e nesse caso a
   * divergência seria a tela dizer "simulado" enquanto a nota sai de verdade.
   */
  modo() {
    return { modo: this.fiscalProvider.modo() };
  }

  async findBySale(saleId: string) {
    return this.prisma.invoice.findUnique({ where: { saleId }, include: { corrections: true } });
  }

  async issue(saleId: string, type: InvoiceType) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: true,
        invoice: true,
        payments: true,
        items: { include: { product: true } },
        tenant: { select: { document: true, name: true } },
      },
    });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    if (sale.status !== 'CONFIRMED') {
      throw new BadRequestException('Só é possível emitir nota fiscal para vendas confirmadas');
    }
    if (sale.invoice && sale.invoice.status === InvoiceStatus.ISSUED) {
      throw new BadRequestException('Esta venda já tem uma nota fiscal emitida — cancele antes de emitir outra');
    }

    if (!sale.tenant.document) {
      throw new BadRequestException('Cadastre o CNPJ da empresa em Configurações antes de emitir nota fiscal.');
    }

    const items = this.buildItems(sale.items);

    // A referência é estável por venda: reenviar a mesma não gera segunda nota
    // no provedor. Reaproveitamos a de uma tentativa anterior que falhou.
    const ref = sale.invoice?.externalRef ?? `venda-${sale.id}`;

    try {
      const result = await this.fiscalProvider.issue({
        type,
        ref,
        emitter: { cnpj: sale.tenant.document },
        recipient: sale.customer
          ? { document: sale.customer.document ?? undefined, name: sale.customer.name, email: sale.customer.email ?? undefined }
          : undefined,
        items,
        payments: sale.payments.map((p) => ({ method: p.method, amount: Number(p.amount) })),
        totalAmount: Number(sale.total),
        issuedAt: sale.confirmedAt ?? new Date(),
      });

      return this.persist(saleId, sale.invoice?.id, {
        type,
        status: InvoiceStatus.ISSUED,
        externalRef: ref,
        accessKey: result.accessKey,
        series: result.series,
        number: result.number,
        xmlContent: result.xmlContent ?? null,
        danfeUrl: result.danfeUrl ?? null,
        xmlUrl: result.xmlUrl ?? null,
        protocol: result.protocol ?? null,
        sefazStatus: result.sefazStatus ?? null,
        sefazMessage: result.sefazMessage ?? null,
        issuedAt: new Date(),
        canceledAt: null,
        cancelReason: null,
      });
    } catch (error) {
      if (error instanceof FiscalProviderError) {
        // A rejeição fica registrada na venda: sem isso, quem tenta de novo
        // amanhã não faz ideia do que a SEFAZ reclamou hoje.
        await this.persist(saleId, sale.invoice?.id, {
          type,
          status: InvoiceStatus.ERROR,
          externalRef: ref,
          sefazStatus: error.sefazStatus ?? null,
          sefazMessage: error.sefazMessage ?? error.message,
        });
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * Converte os itens da venda no formato fiscal, validando o que a SEFAZ
   * exige. A validação acontece AQUI, antes da chamada: é muito melhor dizer
   * "falta o NCM do produto X" do que repassar uma rejeição genérica do fisco
   * para alguém que está com o cliente na frente.
   */
  private buildItems(
    saleItems: (Prisma.SaleItemGetPayload<{ include: { product: true } }>)[],
  ): InvoiceLineItem[] {
    const missing: string[] = [];

    const items = saleItems.map((item) => {
      const name = item.description ?? item.product?.name ?? 'Item';
      const ncm = item.product?.ncm;
      if (!ncm) missing.push(`${name} (NCM)`);

      return {
        productCode: item.product?.sku ?? item.productId ?? 'SEM-CODIGO',
        description: name,
        ncm: ncm ?? '',
        cfop: item.product?.cfop ?? DEFAULT_CFOP,
        unit: item.product?.unit ?? 'UN',
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.total),
        icmsOrigin: item.product?.icmsOrigem ?? DEFAULT_ICMS_ORIGIN,
        // Sem CST cadastrado, assume 102 (Simples Nacional sem permissão de
        // crédito) — o caso mais comum no pequeno comércio brasileiro.
        icmsCst: item.product?.icmsCst ?? '102',
      };
    });

    if (missing.length > 0) {
      throw new BadRequestException(
        `Complete os dados fiscais antes de emitir: ${missing.join(', ')}. Edite o produto e informe o NCM.`,
      );
    }
    return items;
  }

  private persist(saleId: string, invoiceId: string | undefined, data: Record<string, unknown>) {
    if (invoiceId) {
      return this.prisma.invoice.update({ where: { saleId }, data });
    }
    return this.prisma.invoice.create({ data: { ...data, saleId } as Prisma.InvoiceUncheckedCreateInput });
  }

  /**
   * Cancela a nota na SEFAZ e registra o cancelamento.
   *
   * A reivindicação vem ANTES da chamada ao provedor. Conferindo só em
   * memória, três cancelamentos simultâneos passavam os três — e cada um é um
   * pedido de cancelamento enviado ao fisco pela mesma nota. Se o provedor
   * recusar, o status volta para ISSUED: a nota continua valendo, e quem tentar
   * de novo consegue.
   */
  async cancel(saleId: string, reason: string) {
    const invoice = await this.requireBySale(saleId);
    if (!invoice.accessKey && invoice.status === InvoiceStatus.ISSUED) {
      throw new BadRequestException('Nota fiscal sem chave de acesso');
    }

    const { count } = await this.prisma.invoice.updateMany({
      where: { saleId, status: InvoiceStatus.ISSUED },
      data: { status: InvoiceStatus.CANCELED, cancelReason: reason, canceledAt: new Date() },
    });
    if (count === 0) throw new BadRequestException('Só é possível cancelar uma nota fiscal emitida');

    try {
      await this.fiscalProvider.cancel(invoice.externalRef ?? `venda-${saleId}`, invoice.accessKey!, reason);
    } catch (error) {
      await this.prisma.invoice.update({
        where: { saleId },
        data: { status: InvoiceStatus.ISSUED, cancelReason: null, canceledAt: null },
      });
      if (error instanceof FiscalProviderError) throw new BadRequestException(error.message);
      throw error;
    }

    return this.prisma.invoice.findUniqueOrThrow({ where: { saleId } });
  }

  async addCorrection(saleId: string, text: string) {
    const invoice = await this.requireBySale(saleId);
    if (invoice.status !== InvoiceStatus.ISSUED) {
      throw new BadRequestException('Só é possível emitir carta de correção para uma nota fiscal emitida');
    }
    return this.prisma.invoiceCorrection.create({
      data: { invoiceId: invoice.id, text } as Prisma.InvoiceCorrectionUncheckedCreateInput,
    });
  }

  private async requireBySale(saleId: string) {
    const invoice = await this.findBySale(saleId);
    if (!invoice) throw new NotFoundException('Nota fiscal não encontrada para esta venda');
    return invoice;
  }
}
