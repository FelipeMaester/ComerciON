import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { SaleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Escapa um valor para CSV (RFC 4180) — só entre aspas quando necessário. */
function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Exportação de relatórios (Fase 6). CSV é gerado sem dependências (o
 * próprio Excel abre CSV nativamente); PDF usa pdfkit para um resumo simples
 * — nenhum dos dois depende de integração externa.
 */
@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  private async getSalesForExport(from: Date, to: Date) {
    return this.prisma.sale.findMany({
      where: { status: SaleStatus.CONFIRMED, confirmedAt: { gte: from, lt: to } },
      include: { customer: true, items: true },
      orderBy: { confirmedAt: 'asc' },
    });
  }

  async exportSalesCsv(from: Date, to: Date): Promise<string> {
    const sales = await this.getSalesForExport(from, to);

    const header = ['Data', 'Pedido', 'Cliente', 'Itens', 'Subtotal', 'Desconto', 'Frete', 'Total'];
    const rows = sales.map((s) => [
      s.confirmedAt ? s.confirmedAt.toISOString().slice(0, 10) : '',
      s.id,
      s.customer?.name ?? 'Cliente avulso',
      String(s.items.reduce((sum, i) => sum + i.quantity, 0)),
      Number(s.subtotal).toFixed(2),
      Number(s.discount).toFixed(2),
      Number(s.shippingCost).toFixed(2),
      Number(s.total).toFixed(2),
    ]);

    return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  }

  async exportSalesPdf(from: Date, to: Date): Promise<Buffer> {
    const sales = await this.getSalesForExport(from, to);
    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text('Relatório de vendas', { align: 'left' });
      doc
        .fontSize(10)
        .fillColor('#555555')
        .text(`Período: ${from.toLocaleDateString('pt-BR')} a ${to.toLocaleDateString('pt-BR')}`);
      doc.moveDown();

      doc.fillColor('#000000').fontSize(12);
      doc.text(`Total de vendas: ${sales.length}`);
      doc.text(`Faturamento: R$ ${totalRevenue.toFixed(2)}`);
      doc.moveDown();

      doc.fontSize(10);
      if (sales.length === 0) {
        doc.text('Nenhuma venda confirmada no período.');
      }
      for (const s of sales) {
        const date = s.confirmedAt ? s.confirmedAt.toLocaleDateString('pt-BR') : '—';
        const customer = s.customer?.name ?? 'Cliente avulso';
        doc.text(`${date}   ${s.id.slice(0, 8)}   ${customer}   R$ ${Number(s.total).toFixed(2)}`);
      }

      doc.end();
    });
  }
}
