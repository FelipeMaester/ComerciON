import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AuditService } from '../audit/audit.service';

describe('SuperAdminService', () => {
  let service: SuperAdminService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let billingService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let audit: any;

  beforeEach(() => {
    // `tx` traz as tabelas que precisam sair antes da loja; `$transaction`
    // apenas executa o callback com ele, que é o suficiente para o teste
    // verificar a ORDEM das exclusões.
    tx = {
      cashMovement: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      cashSession: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      task: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      serviceOrder: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      quote: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      tenant: { delete: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      tenant: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
      // Executa o callback, e registra que foi chamado: o teste abaixo cobra
      // que a exclusão aconteça de dentro dele.
      runAsSystem: jest.fn(async (cb: () => Promise<unknown>) => cb()),
    };
    billingService = { subscribe: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new SuperAdminService(
      prisma as unknown as PrismaService,
      billingService as unknown as BillingService,
      audit as unknown as AuditService,
    );
  });

  describe('getTenant', () => {
    it('lança NotFoundException quando o tenant não existe', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.getTenant('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('devolve o tenant com a assinatura e as faturas', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 't1', name: 'Demo', subscription: { plan: { key: 'pro' } } });
      const result = await service.getTenant('t1');
      expect(result).toEqual({ id: 't1', name: 'Demo', subscription: { plan: { key: 'pro' } } });
    });
  });

  describe('updateStatus', () => {
    it('rejeita quando o tenant não existe', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.updateStatus('ghost', 'SUSPENDED')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tenant.update).not.toHaveBeenCalled();
    });

    it('atualiza o status do tenant existente', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 't1' });
      prisma.tenant.update.mockResolvedValue({ id: 't1', status: 'SUSPENDED' });

      await service.updateStatus('t1', 'SUSPENDED');

      expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'SUSPENDED' } });
    });
  });

  describe('changePlan', () => {
    it('rejeita quando o tenant não existe', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.changePlan('ghost', 'pro')).rejects.toBeInstanceOf(NotFoundException);
      expect(billingService.subscribe).not.toHaveBeenCalled();
    });

    it('delega para o BillingService quando o tenant existe', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 't1' });
      billingService.subscribe.mockResolvedValue({ id: 'sub-1' });

      const result = await service.changePlan('t1', 'premium');

      expect(billingService.subscribe).toHaveBeenCalledWith('t1', 'premium');
      expect(result).toEqual({ id: 'sub-1' });
    });
  });

  /**
   * A loja que encerra o contrato tem direito de pedir os dados fora. Até aqui
   * o sistema não tinha como atender: a exclusão falhava com violação de chave
   * estrangeira, porque cinco tabelas apontam para User, Customer e Vehicle com
   * RESTRICT e precisam sair antes.
   */
  describe('excluirLoja', () => {
    const loja = { id: 'loja-1', slug: 'autopecas-silva', name: 'AutoPeças Silva', createdAt: new Date() };

    it('apaga o que bloqueia antes da loja, e nessa ordem', async () => {
      prisma.tenant.findUnique.mockResolvedValue(loja);

      await service.excluirLoja('loja-1', 'autopecas-silva');

      // A ordem é o ponto: movimentação antes da sessão de caixa que a contém,
      // ordem de serviço antes do orçamento que a originou, e a loja por último.
      const ordem = [
        tx.cashMovement.deleteMany.mock.invocationCallOrder[0],
        tx.cashSession.deleteMany.mock.invocationCallOrder[0],
        tx.task.deleteMany.mock.invocationCallOrder[0],
        tx.serviceOrder.deleteMany.mock.invocationCallOrder[0],
        tx.quote.deleteMany.mock.invocationCallOrder[0],
        tx.tenant.delete.mock.invocationCallOrder[0],
      ];
      expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
      expect(tx.tenant.delete).toHaveBeenCalledWith({ where: { id: 'loja-1' } });
    });

    it('mira sempre a loja pedida, e não a de quem está excluindo', async () => {
      prisma.tenant.findUnique.mockResolvedValue(loja);

      await service.excluirLoja('loja-1', 'autopecas-silva');

      for (const tabela of [tx.cashMovement, tx.cashSession, tx.task, tx.serviceOrder, tx.quote]) {
        expect(tabela.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'loja-1' } });
      }
    });

    /**
     * O erro mais caro que cometi nesta função, e o motivo de este teste
     * existir.
     *
     * As tabelas que saem antes da loja são filtradas por loja automaticamente,
     * e esse filtro SOBRESCREVE o tenantId da consulta em vez de somar. Fora de
     * `runAsSystem`, o super admin que manda apagar a loja A apaga os dados da
     * própria loja dele. Foi o que aconteceu: a primeira versão levou junto os
     * orçamentos, as ordens de serviço, as tarefas e o caixa da loja de
     * demonstração.
     *
     * Os outros testes daqui não pegam isso — mock não tem middleware. Este
     * cobra a única coisa que o mock consegue enxergar: que a exclusão corre
     * por fora do filtro.
     */
    it('exclui por fora do filtro por loja, ou apagaria a loja errada', async () => {
      prisma.tenant.findUnique.mockResolvedValue(loja);

      await service.excluirLoja('loja-1', 'autopecas-silva');

      expect(prisma.runAsSystem).toHaveBeenCalled();
      // E a transação corre DENTRO dele, não ao lado.
      expect(prisma.runAsSystem.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.$transaction.mock.invocationCallOrder[0],
      );
    });

    it('recusa quando o identificador de confirmação não bate', async () => {
      prisma.tenant.findUnique.mockResolvedValue(loja);

      await expect(service.excluirLoja('loja-1', 'autopecas-silvo')).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    /**
     * Registrado antes de apagar, porque depois não há de onde tirar nome e
     * identificador. O log sobrevive à loja de propósito.
     */
    it('deixa registro de auditoria com o que a loja era', async () => {
      prisma.tenant.findUnique.mockResolvedValue(loja);

      await service.excluirLoja('loja-1', 'autopecas-silva');

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'tenant.deleted',
          entityId: 'loja-1',
          metadata: expect.objectContaining({ slug: 'autopecas-silva', nome: 'AutoPeças Silva' }),
        }),
      );
    });

    it('não apaga nada quando a loja não existe', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.excluirLoja('some-id', 'qualquer')).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
