import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, InvoiceType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FISCAL_PROVIDER, FiscalProvider } from './fiscal-provider.interface';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FISCAL_PROVIDER) private readonly fiscalProvider: FiscalProvider,
  ) {}

  async findBySale(saleId: string) {
    return this.prisma.invoice.findUnique({ where: { saleId }, include: { corrections: true } });
  }

  async issue(saleId: string, type: InvoiceType) {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId }, include: { customer: true, invoice: true } });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    if (sale.status !== 'CONFIRMED') {
      throw new BadRequestException('Só é possível emitir nota fiscal para vendas confirmadas');
    }
    if (sale.invoice && sale.invoice.status === InvoiceStatus.ISSUED) {
      throw new BadRequestException('Esta venda já tem uma nota fiscal emitida — cancele antes de emitir outra');
    }

    const result = await this.fiscalProvider.issue({
      type,
      saleId: sale.id,
      totalAmount: Number(sale.total),
      customerDocument: sale.customer?.document ?? undefined,
      customerName: sale.customer?.name,
    });

    const data = {
      type,
      status: InvoiceStatus.ISSUED,
      accessKey: result.accessKey,
      series: result.series,
      number: result.number,
      xmlContent: result.xmlContent,
      issuedAt: new Date(),
      canceledAt: null,
      cancelReason: null,
    };

    if (sale.invoice) {
      return this.prisma.invoice.update({ where: { saleId }, data });
    }
    return this.prisma.invoice.create({ data: { ...data, saleId } as Prisma.InvoiceUncheckedCreateInput });
  }

  async cancel(saleId: string, reason: string) {
    const invoice = await this.requireBySale(saleId);
    if (invoice.status !== InvoiceStatus.ISSUED) {
      throw new BadRequestException('Só é possível cancelar uma nota fiscal emitida');
    }
    if (!invoice.accessKey) throw new BadRequestException('Nota fiscal sem chave de acesso');

    await this.fiscalProvider.cancel(invoice.accessKey, reason);

    return this.prisma.invoice.update({
      where: { saleId },
      data: { status: InvoiceStatus.CANCELED, cancelReason: reason, canceledAt: new Date() },
    });
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
