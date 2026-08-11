import { NotFoundException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TasksService', () => {
  let service: TasksService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      customer: { findUnique: jest.fn() },
      opportunity: { findUnique: jest.fn() },
      task: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    };
    service = new TasksService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('rejeita quando o usuário responsável não existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.create({ title: 'Ligar pro cliente', assignedToId: 'user-x' }, 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('atribui a si mesmo quando assignedToId não é informado', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.task.create.mockResolvedValue({ id: 'task-1' });

      await service.create({ title: 'Ligar pro cliente' }, 'user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
      expect(prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assignedToId: 'user-1', createdById: 'user-1' }),
        }),
      );
    });

    it('rejeita quando o cliente vinculado não existe', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ title: 'Ligar pro cliente', customerId: 'customer-x' }, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('sem filtros, mostra só as tarefas do usuário logado', async () => {
      prisma.task.findMany.mockResolvedValue([]);
      await service.findAll({}, 'user-1');
      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assignedToId: 'user-1' } }),
      );
    });

    it('com customerId, mostra as tarefas do cliente independente do responsável', async () => {
      prisma.task.findMany.mockResolvedValue([]);
      await service.findAll({ customerId: 'customer-1' }, 'user-1');
      const where = prisma.task.findMany.mock.calls[0][0].where;
      expect(where.assignedToId).toBeUndefined();
      expect(where.customerId).toBe('customer-1');
    });

    it('overdue=true filtra pendentes com vencimento no passado, ignorando status explícito', async () => {
      prisma.task.findMany.mockResolvedValue([]);
      await service.findAll({ overdue: true, status: TaskStatus.DONE }, 'user-1');
      const where = prisma.task.findMany.mock.calls[0][0].where;
      expect(where.status).toBe(TaskStatus.PENDING);
      expect(where.dueDate).toEqual({ lt: expect.any(Date) });
    });
  });

  describe('findOne', () => {
    it('rejeita quando a tarefa não existe', async () => {
      prisma.task.findUnique.mockResolvedValue(null);
      await expect(service.findOne('task-x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('complete/reopen', () => {
    it('complete marca DONE e preenche completedAt', async () => {
      prisma.task.findUnique.mockResolvedValue({ id: 'task-1' });
      prisma.task.update.mockResolvedValue({ id: 'task-1' });

      await service.complete('task-1');

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({ status: TaskStatus.DONE, completedAt: expect.any(Date) }),
        }),
      );
    });

    it('reopen volta para PENDING e limpa completedAt', async () => {
      prisma.task.findUnique.mockResolvedValue({ id: 'task-1' });
      prisma.task.update.mockResolvedValue({ id: 'task-1' });

      await service.reopen('task-1');

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'task-1' },
          data: expect.objectContaining({ status: TaskStatus.PENDING, completedAt: null }),
        }),
      );
    });
  });
});
