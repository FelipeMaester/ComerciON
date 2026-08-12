import { jobLockAlwaysGrants } from '../common/scheduling/job-lock.test-double';
import { AutomationsService } from './automations.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { WhatsAppProvider } from './whatsapp-provider.interface';

describe('AutomationsService', () => {
  let service: AutomationsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tenantContext: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let provider: any;

  beforeEach(() => {
    prisma = {
      sale: { findUnique: jest.fn() },
      financialEntry: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
      cartSnapshot: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
      conversation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'conv-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      message: { create: jest.fn().mockResolvedValue({}) },
      tenant: { findMany: jest.fn().mockResolvedValue([]) },
      runAsSystem: jest.fn((cb: () => unknown) => cb()),
    };
    tenantContext = { run: jest.fn((_ctx: unknown, cb: () => unknown) => cb()) };
    provider = { sendText: jest.fn().mockResolvedValue({ externalId: 'ext-1' }) };
    service = new AutomationsService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
      provider as unknown as WhatsAppProvider,
      jobLockAlwaysGrants(),
    );
  });

  describe('sendOrderConfirmation', () => {
    it('não envia nada quando o cliente não tem telefone cadastrado', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-1', total: 100, customer: { id: 'cust-1', phone: null } });
      await service.sendOrderConfirmation('sale-1');
      expect(provider.sendText).not.toHaveBeenCalled();
    });

    it('envia a confirmação e registra a mensagem na conversa do cliente', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 'sale-12345678', total: 376.5, customer: { id: 'cust-1', phone: '+5511999998888' } });
      prisma.conversation.create.mockResolvedValue({ id: 'conv-1' });

      await service.sendOrderConfirmation('sale-12345678');

      expect(provider.sendText).toHaveBeenCalledWith('+5511999998888', expect.stringContaining('sale-123'));
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ automationType: 'ORDER_CONFIRMATION' }) }),
      );
    });
  });

  describe('sendShippingUpdate', () => {
    it('ignora status que não são de envio efetivo (ex.: PROCESSING)', async () => {
      await service.sendShippingUpdate('sale-1', 'PROCESSING' as never);
      expect(prisma.sale.findUnique).not.toHaveBeenCalled();
    });

    it('envia aviso com código de rastreio quando o status é SHIPPED', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-12345678',
        customer: { id: 'cust-1', phone: '+5511999998888' },
        shipment: { trackingCode: 'BR123456789' },
      });

      await service.sendShippingUpdate('sale-12345678', 'SHIPPED' as never);

      expect(provider.sendText).toHaveBeenCalledWith('+5511999998888', expect.stringContaining('BR123456789'));
    });
  });

  describe('sendPaymentReminders', () => {
    it('envia lembrete para contas vencidas com cliente com telefone e marca reminderSentAt', async () => {
      prisma.financialEntry.findMany.mockResolvedValue([
        { id: 'fe-1', description: 'Venda x', amount: 100, dueDate: new Date('2026-01-01'), customer: { id: 'cust-1', name: 'Maria', phone: '+5511999998888' } },
      ]);

      await service.sendPaymentReminders();

      expect(provider.sendText).toHaveBeenCalledWith('+5511999998888', expect.stringContaining('Maria'));
      expect(prisma.financialEntry.update).toHaveBeenCalledWith({ where: { id: 'fe-1' }, data: { reminderSentAt: expect.any(Date) } });
    });

    it('pula contas de clientes sem telefone', async () => {
      prisma.financialEntry.findMany.mockResolvedValue([
        { id: 'fe-1', description: 'Venda x', amount: 100, dueDate: new Date(), customer: { id: 'cust-1', name: 'Maria', phone: null } },
      ]);

      await service.sendPaymentReminders();

      expect(provider.sendText).not.toHaveBeenCalled();
      expect(prisma.financialEntry.update).not.toHaveBeenCalled();
    });
  });

  describe('sendAbandonedCartReminders', () => {
    it('envia lembrete de carrinho abandonado e marca reminderSentAt', async () => {
      prisma.cartSnapshot.findMany.mockResolvedValue([
        {
          id: 'cart-1',
          itemsJson: [{ name: 'Radiador Gol', quantity: 1 }],
          customer: { id: 'cust-1', name: 'João', phone: '+5511999998888' },
        },
      ]);

      await service.sendAbandonedCartReminders();

      expect(provider.sendText).toHaveBeenCalledWith('+5511999998888', expect.stringContaining('Radiador Gol'));
      expect(prisma.cartSnapshot.update).toHaveBeenCalledWith({ where: { id: 'cart-1' }, data: { reminderSentAt: expect.any(Date) } });
    });
  });

  describe('runDailyAutomations', () => {
    it('roda as automações diárias dentro do contexto de cada tenant', async () => {
      prisma.tenant.findMany.mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]);

      await service.runDailyAutomations();

      expect(prisma.runAsSystem).toHaveBeenCalled();
      expect(tenantContext.run).toHaveBeenCalledTimes(2);
      expect(tenantContext.run).toHaveBeenCalledWith({ tenantId: 'tenant-1' }, expect.any(Function));
      expect(tenantContext.run).toHaveBeenCalledWith({ tenantId: 'tenant-2' }, expect.any(Function));
    });

    it('continua para o próximo tenant mesmo se um deles falhar', async () => {
      prisma.tenant.findMany.mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]);
      prisma.financialEntry.findMany.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([]);

      await expect(service.runDailyAutomations()).resolves.toBeUndefined();
      expect(tenantContext.run).toHaveBeenCalledTimes(2);
    });
  });
});
