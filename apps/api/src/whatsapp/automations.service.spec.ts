import { jobLockAlwaysGrants } from '../common/scheduling/job-lock.test-double';
import { AutomationsService } from './automations.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { WhatsappSenderService } from './whatsapp-sender.service';

describe('AutomationsService', () => {
  let service: AutomationsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tenantContext: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sender: any;

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
    // O sender é o ponto único de envio: ele aplica o teto da loja e grava
    // a mensagem. Devolver true = enviou; false = teto atingido.
    sender = { enviarAutomatico: jest.fn().mockResolvedValue(true) };
    service = new AutomationsService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
      sender as unknown as WhatsappSenderService,
      jobLockAlwaysGrants(),
    );
  });



  describe('sendPaymentReminders', () => {
    it('envia lembrete para contas vencidas com cliente com telefone e marca reminderSentAt', async () => {
      prisma.financialEntry.findMany.mockResolvedValue([
        { id: 'fe-1', description: 'Venda x', amount: 100, dueDate: new Date('2026-01-01'), customer: { id: 'cust-1', name: 'Maria', phone: '+5511999998888' } },
      ]);

      await service.sendPaymentReminders();

      expect(sender.enviarAutomatico).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '+5511999998888', text: expect.stringContaining('Maria') }),
      );
      expect(prisma.financialEntry.update).toHaveBeenCalledWith({ where: { id: 'fe-1' }, data: { reminderSentAt: expect.any(Date) } });
    });

    it('não cobra quem vence hoje — a busca corta na meia-noite, não no instante', async () => {
      // O pior efeito do defeito, e o único que sai da loja: a busca usava
      // `lt: new Date()`, então uma conta criada hoje às 19h entrava na lista
      // às 19h01 e o cliente recebia "identificamos uma pendência vencida em
      // {hoje}" no próprio dia do vencimento. A loja acusando de atraso quem
      // estava em dia.
      //
      // Confere o WHERE, e não o resultado: os outros testes deste bloco
      // mocam a resposta do banco, então nunca exercitam o filtro — que é
      // exatamente onde o defeito morava.
      prisma.financialEntry.findMany.mockResolvedValue([]);

      await service.sendPaymentReminders();

      const { where } = prisma.financialEntry.findMany.mock.calls[0][0];
      const corte: Date = where.dueDate.lt;
      const hoje = new Date();

      expect([corte.getHours(), corte.getMinutes(), corte.getSeconds(), corte.getMilliseconds()]).toEqual([
        0, 0, 0, 0,
      ]);
      expect(corte.getDate()).toBe(hoje.getDate());
      expect(corte.getMonth()).toBe(hoje.getMonth());
    });

    it('pula contas de clientes sem telefone', async () => {
      prisma.financialEntry.findMany.mockResolvedValue([
        { id: 'fe-1', description: 'Venda x', amount: 100, dueDate: new Date(), customer: { id: 'cust-1', name: 'Maria', phone: null } },
      ]);

      await service.sendPaymentReminders();

      expect(sender.enviarAutomatico).not.toHaveBeenCalled();
      expect(prisma.financialEntry.update).not.toHaveBeenCalled();
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
