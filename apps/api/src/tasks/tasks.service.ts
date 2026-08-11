import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const TASK_INCLUDE = {
  assignedTo: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
  opportunity: { select: { id: true, title: true } },
} as const;

export interface TaskFilters {
  assignedToId?: string;
  status?: TaskStatus;
  customerId?: string;
  opportunityId?: string;
  overdue?: boolean;
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTaskDto, currentUserId: string) {
    const assignedToId = dto.assignedToId ?? currentUserId;
    await this.assertUserExists(assignedToId);
    if (dto.customerId) await this.assertCustomerExists(dto.customerId);
    if (dto.opportunityId) await this.assertOpportunityExists(dto.opportunityId);

    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        assignedToId,
        createdById: currentUserId,
        customerId: dto.customerId,
        opportunityId: dto.opportunityId,
      } as Prisma.TaskUncheckedCreateInput,
      include: TASK_INCLUDE,
    });
  }

  /**
   * Sem assignedToId nem vínculo com Customer/Opportunity, mostra só as
   * tarefas do próprio usuário (caso de uso mais comum: "minhas tarefas de
   * hoje"). Quando a consulta já é escopada por cliente/oportunidade (ex.:
   * seção de tarefas na tela do cliente), mostra todas as tarefas ligadas
   * àquele registro, não só as do usuário logado.
   */
  async findAll(filters: TaskFilters, currentUserId: string) {
    const scopedByRelation = Boolean(filters.customerId || filters.opportunityId);
    const where: Prisma.TaskWhereInput = {};

    if (filters.assignedToId) {
      where.assignedToId = filters.assignedToId;
    } else if (!scopedByRelation) {
      where.assignedToId = currentUserId;
    }
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.opportunityId) where.opportunityId = filters.opportunityId;

    if (filters.overdue) {
      where.status = TaskStatus.PENDING;
      where.dueDate = { lt: new Date() };
    } else if (filters.status) {
      where.status = filters.status;
    }

    return this.prisma.task.findMany({
      where,
      include: TASK_INCLUDE,
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    });
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!task) throw new NotFoundException('Tarefa não encontrada');
    return task;
  }

  async update(id: string, dto: UpdateTaskDto) {
    await this.findOne(id);
    if (dto.assignedToId) await this.assertUserExists(dto.assignedToId);
    if (dto.customerId) await this.assertCustomerExists(dto.customerId);
    if (dto.opportunityId) await this.assertOpportunityExists(dto.opportunityId);

    return this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
        assignedToId: dto.assignedToId,
        customerId: dto.customerId,
        opportunityId: dto.opportunityId,
      },
      include: TASK_INCLUDE,
    });
  }

  async complete(id: string) {
    await this.findOne(id);
    return this.prisma.task.update({
      where: { id },
      data: { status: TaskStatus.DONE, completedAt: new Date() },
      include: TASK_INCLUDE,
    });
  }

  async reopen(id: string) {
    await this.findOne(id);
    return this.prisma.task.update({
      where: { id },
      data: { status: TaskStatus.PENDING, completedAt: null },
      include: TASK_INCLUDE,
    });
  }

  private async assertUserExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário responsável não encontrado');
  }

  private async assertCustomerExists(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
  }

  private async assertOpportunityExists(id: string) {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id } });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada');
  }
}
