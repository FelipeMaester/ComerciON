import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { FiscalProvider } from './fiscal-provider.interface';

describe('InvoicesService', () => {
  let service: InvoicesService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fiscalProvider: any;

  const confirmedSale = { id: 'sale-1', status: 'CONFIRMED', total: 100, customer: null, invoice: null };

  beforeEach(() => {
    fiscalProvider = {
      issue: jest.fn().mockResolvedValue({ accessKey: '1'.repeat(44), series: '1', number: '123456', xmlContent: '<xml/>' }),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      sale: { findUnique: jest.fn() },
      invoice: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      invoiceCorrection: { create: jest.fn() },
    };
    service = new InvoicesService(prisma as unknown as PrismaService, fiscalProvider as unknown as FiscalProvider);
  });

  describe('issue', () => {
    it('rejeita emitir nota para venda que não existe', async () => {
      prisma.sale.findUnique.mockResolvedValue(null);
      await expect(service.issue('ghost', 'NFCE')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita emitir nota para venda não confirmada', async () => {
      prisma.sale.findUnique.mockResolvedValue({ ...confirmedSale, status: 'QUOTE' });
      await expect(service.issue('sale-1', 'NFCE')).rejects.toBeInstanceOf(BadRequestException);
      expect(fiscalProvider.issue).not.toHaveBeenCalled();
    });

    it('rejeita emitir de novo se já existe nota ISSUED (precisa cancelar antes)', async () => {
      prisma.sale.findUnique.mockResolvedValue({ ...confirmedSale, invoice: { status: 'ISSUED' } });
      await expect(service.issue('sale-1', 'NFCE')).rejects.toBeInstanceOf(BadRequestException);
      expect(fiscalProvider.issue).not.toHaveBeenCalled();
    });

    it('emite e cria o registro de Invoice quando a venda está confirmada e sem nota ainda', async () => {
      prisma.sale.findUnique.mockResolvedValue(confirmedSale);
      prisma.invoice.create.mockResolvedValue({ id: 'inv-1', status: 'ISSUED' });

      await service.issue('sale-1', 'NFCE');

      expect(fiscalProvider.issue).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'NFCE', saleId: 'sale-1', totalAmount: 100 }),
      );
      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ saleId: 'sale-1', status: 'ISSUED', accessKey: '1'.repeat(44) }),
        }),
      );
    });
  });

  describe('cancel', () => {
    it('lança NotFoundException se não existe nota para a venda', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);
      await expect(service.cancel('sale-1', 'Motivo válido com mais de 15 caracteres')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejeita cancelar uma nota que não está ISSUED', async () => {
      prisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'CANCELED', accessKey: '1'.repeat(44) });
      await expect(service.cancel('sale-1', 'Motivo válido com mais de 15 caracteres')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(fiscalProvider.cancel).not.toHaveBeenCalled();
    });

    it('cancela uma nota ISSUED chamando o provider e atualizando o status', async () => {
      prisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'ISSUED', accessKey: '1'.repeat(44) });
      prisma.invoice.update.mockResolvedValue({ id: 'inv-1', status: 'CANCELED' });

      await service.cancel('sale-1', 'Motivo válido com mais de 15 caracteres');

      expect(fiscalProvider.cancel).toHaveBeenCalledWith('1'.repeat(44), 'Motivo válido com mais de 15 caracteres');
      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELED' }) }),
      );
    });
  });

  describe('addCorrection', () => {
    it('rejeita carta de correção para nota que não está ISSUED', async () => {
      prisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'PENDING' });
      await expect(service.addCorrection('sale-1', 'Texto de correção com mais de 15 caracteres')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('adiciona a correção quando a nota está ISSUED', async () => {
      prisma.invoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'ISSUED' });
      prisma.invoiceCorrection.create.mockResolvedValue({ id: 'corr-1' });

      await service.addCorrection('sale-1', 'Texto de correção com mais de 15 caracteres');

      expect(prisma.invoiceCorrection.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ invoiceId: 'inv-1' }) }),
      );
    });
  });
});
