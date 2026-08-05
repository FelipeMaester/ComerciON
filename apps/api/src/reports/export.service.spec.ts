import { ExportService } from './export.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ExportService', () => {
  let service: ExportService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const sale = {
    id: 'sale-12345678',
    confirmedAt: new Date('2026-08-05T10:00:00Z'),
    customer: { name: 'Maria Compradora' },
    channel: 'ONLINE',
    subtotal: 420,
    discount: 0,
    shippingCost: 16.5,
    total: 436.5,
    items: [{ quantity: 1 }],
  };

  beforeEach(() => {
    prisma = { sale: { findMany: jest.fn().mockResolvedValue([sale]) } };
    service = new ExportService(prisma as unknown as PrismaService);
  });

  describe('exportSalesCsv', () => {
    it('gera cabeçalho e uma linha por venda confirmada no período', async () => {
      const csv = await service.exportSalesCsv(new Date('2026-08-01'), new Date('2026-09-01'));
      const lines = csv.split('\n');

      expect(lines[0]).toBe('Data,Pedido,Cliente,Canal,Itens,Subtotal,Desconto,Frete,Total');
      expect(lines[1]).toBe('2026-08-05,sale-12345678,Maria Compradora,ONLINE,1,420.00,0.00,16.50,436.50');
    });

    it('escapa vírgulas e aspas no nome do cliente', async () => {
      prisma.sale.findMany.mockResolvedValue([{ ...sale, customer: { name: 'Cliente, com "apelido"' } }]);
      const csv = await service.exportSalesCsv(new Date(), new Date());
      expect(csv).toContain('"Cliente, com ""apelido"""');
    });

    it('usa "Cliente avulso" quando a venda não tem cliente vinculado', async () => {
      prisma.sale.findMany.mockResolvedValue([{ ...sale, customer: null }]);
      const csv = await service.exportSalesCsv(new Date(), new Date());
      expect(csv).toContain('Cliente avulso');
    });
  });

  describe('exportSalesPdf', () => {
    it('gera um PDF válido (buffer não vazio começando com a assinatura %PDF)', async () => {
      const buffer = await service.exportSalesPdf(new Date('2026-08-01'), new Date('2026-09-01'));
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('não quebra quando não há vendas no período', async () => {
      prisma.sale.findMany.mockResolvedValue([]);
      const buffer = await service.exportSalesPdf(new Date(), new Date());
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
