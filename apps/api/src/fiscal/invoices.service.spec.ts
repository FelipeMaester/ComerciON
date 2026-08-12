import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { FiscalProvider, FiscalProviderError } from './fiscal-provider.interface';

describe('InvoicesService', () => {
  let service: InvoicesService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fiscalProvider: any;

  /** Produto com os dados fiscais completos — o caso feliz. */
  const produtoOk = { sku: 'SKU-1', name: 'Radiador', unit: 'UN', ncm: '87089990', cfop: '5102', icmsOrigem: '0', icmsCst: '102' };

  const confirmedSale = {
    id: 'sale-1',
    status: 'CONFIRMED',
    total: 100,
    customer: null,
    invoice: null,
    confirmedAt: new Date('2026-08-12T12:00:00Z'),
    tenant: { document: '12345678000199', name: 'Loja Demo' },
    payments: [{ method: 'CASH', amount: 100 }],
    items: [{ productId: 'p-1', description: null, quantity: 1, unitPrice: 100, total: 100, product: produtoOk }],
  };

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
        expect.objectContaining({
          type: 'NFCE',
          totalAmount: 100,
          // Referência estável por venda: é a chave de idempotência que impede
          // uma segunda nota se a requisição for repetida.
          ref: 'venda-sale-1',
          emitter: { cnpj: '12345678000199' },
        }),
      );
      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ saleId: 'sale-1', status: 'ISSUED', accessKey: '1'.repeat(44) }),
        }),
      );
    });

    it('monta os itens com os dados tributários que a SEFAZ exige', async () => {
      prisma.sale.findUnique.mockResolvedValue(confirmedSale);
      prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });

      await service.issue('sale-1', 'NFCE');

      const { items, payments } = fiscalProvider.issue.mock.calls[0][0];
      expect(items).toEqual([
        expect.objectContaining({
          productCode: 'SKU-1',
          description: 'Radiador',
          ncm: '87089990',
          cfop: '5102',
          unit: 'UN',
          quantity: 1,
          icmsOrigin: '0',
          icmsCst: '102',
        }),
      ]);
      expect(payments).toEqual([{ method: 'CASH', amount: 100 }]);
    });

    it('exige o CNPJ da empresa antes de tentar emitir', async () => {
      prisma.sale.findUnique.mockResolvedValue({ ...confirmedSale, tenant: { document: null, name: 'Loja' } });

      await expect(service.issue('sale-1', 'NFCE')).rejects.toThrow(/CNPJ da empresa/);
      expect(fiscalProvider.issue).not.toHaveBeenCalled();
    });

    it('aponta QUAL produto está sem NCM em vez de deixar a SEFAZ recusar', async () => {
      // Quem está com o cliente na frente precisa saber o que corrigir, não
      // receber uma rejeição genérica do fisco.
      prisma.sale.findUnique.mockResolvedValue({
        ...confirmedSale,
        items: [{ ...confirmedSale.items[0], product: { ...produtoOk, ncm: null } }],
      });

      await expect(service.issue('sale-1', 'NFCE')).rejects.toThrow(/Radiador \(NCM\)/);
      expect(fiscalProvider.issue).not.toHaveBeenCalled();
    });

    it('usa CFOP e CST padrão quando o produto não tem os seus', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        ...confirmedSale,
        items: [{ ...confirmedSale.items[0], product: { ...produtoOk, cfop: null, icmsCst: null } }],
      });
      prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });

      await service.issue('sale-1', 'NFCE');

      const { items } = fiscalProvider.issue.mock.calls[0][0];
      expect(items[0]).toMatchObject({ cfop: '5102', icmsCst: '102' });
    });

    it('registra a rejeição da SEFAZ na venda e devolve a mensagem ao usuário', async () => {
      prisma.sale.findUnique.mockResolvedValue(confirmedSale);
      prisma.invoice.create.mockResolvedValue({ id: 'inv-1' });
      fiscalProvider.issue.mockRejectedValue(
        new FiscalProviderError('NCM inválido para o item 1', '539', 'Rejeicao: NCM invalido'),
      );

      await expect(service.issue('sale-1', 'NFCE')).rejects.toThrow('NCM inválido para o item 1');

      // Sem persistir o motivo, quem tentar de novo amanhã não faz ideia do
      // que a SEFAZ reclamou hoje.
      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ERROR', sefazStatus: '539', sefazMessage: 'Rejeicao: NCM invalido' }),
        }),
      );
    });

    it('reaproveita a referência de uma tentativa anterior que falhou', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        ...confirmedSale,
        invoice: { id: 'inv-1', status: 'ERROR', externalRef: 'venda-sale-1' },
      });
      prisma.invoice.update.mockResolvedValue({ id: 'inv-1' });

      await service.issue('sale-1', 'NFCE');

      expect(fiscalProvider.issue).toHaveBeenCalledWith(expect.objectContaining({ ref: 'venda-sale-1' }));
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

      expect(fiscalProvider.cancel).toHaveBeenCalledWith('venda-sale-1', '1'.repeat(44), 'Motivo válido com mais de 15 caracteres');
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
