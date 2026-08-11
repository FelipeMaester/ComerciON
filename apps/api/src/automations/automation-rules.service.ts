import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AutomationAction, AutomationTrigger, Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAutomationRuleDto } from './dto/create-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-rule.dto';

const TIME_BASED_TRIGGERS = new Set<AutomationTrigger>([
  AutomationTrigger.QUOTE_PENDING_DAYS,
  AutomationTrigger.OPPORTUNITY_STALE_DAYS,
]);

/**
 * CRUD das regras de automação. Cada regra tem um catálogo fixo de
 * gatilhos/ações (não é um motor de condições livres) — a validação de
 * `triggerConfig`/`actionConfig` acontece aqui, na criação/edição, pra nunca
 * deixar uma regra mal configurada chegar no motor de execução.
 */
@Injectable()
export class AutomationRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAutomationRuleDto) {
    await this.validateConfig(dto.trigger, dto.triggerConfig, dto.action, dto.actionConfig);
    return this.prisma.automationRule.create({
      data: {
        name: dto.name,
        trigger: dto.trigger,
        triggerConfig: (dto.triggerConfig ?? null) as Prisma.InputJsonValue,
        action: dto.action,
        actionConfig: dto.actionConfig as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
      } as Prisma.AutomationRuleUncheckedCreateInput,
    });
  }

  async findAll() {
    return this.prisma.automationRule.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const rule = await this.prisma.automationRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Regra de automação não encontrada');
    return rule;
  }

  async update(id: string, dto: UpdateAutomationRuleDto) {
    const existing = await this.findOne(id);
    const trigger = dto.trigger ?? existing.trigger;
    const action = dto.action ?? existing.action;
    const triggerConfig = dto.triggerConfig ?? (existing.triggerConfig as unknown as Record<string, unknown> | null) ?? undefined;
    const actionConfig = dto.actionConfig ?? (existing.actionConfig as unknown as Record<string, unknown>);
    await this.validateConfig(trigger, triggerConfig, action, actionConfig);

    return this.prisma.automationRule.update({
      where: { id },
      data: {
        name: dto.name,
        trigger: dto.trigger,
        triggerConfig: dto.triggerConfig as Prisma.InputJsonValue | undefined,
        action: dto.action,
        actionConfig: dto.actionConfig as Prisma.InputJsonValue | undefined,
        isActive: dto.isActive,
      },
    });
  }

  async listRuns(ruleId: string, limit = 50) {
    await this.findOne(ruleId);
    return this.prisma.automationRunLog.findMany({
      where: { ruleId },
      orderBy: { firedAt: 'desc' },
      take: limit,
    });
  }

  private async validateConfig(
    trigger: AutomationTrigger,
    triggerConfig: Record<string, unknown> | undefined,
    action: AutomationAction,
    actionConfig: Record<string, unknown>,
  ) {
    if (TIME_BASED_TRIGGERS.has(trigger)) {
      const days = triggerConfig?.days;
      if (typeof days !== 'number' || !Number.isInteger(days) || days <= 0) {
        throw new BadRequestException('Este gatilho exige "days" (número inteiro positivo) na configuração');
      }
    }

    if (action === AutomationAction.SEND_WHATSAPP) {
      const template = actionConfig?.messageTemplate;
      if (typeof template !== 'string' || template.trim().length === 0) {
        throw new BadRequestException('A ação de WhatsApp exige "messageTemplate" (texto não vazio)');
      }
    }

    if (action === AutomationAction.CREATE_TASK) {
      const title = actionConfig?.titleTemplate;
      const assignToId = actionConfig?.assignToId;
      if (typeof title !== 'string' || title.trim().length === 0) {
        throw new BadRequestException('A ação de criar tarefa exige "titleTemplate" (texto não vazio)');
      }
      if (typeof assignToId !== 'string' || !isUUID(assignToId)) {
        throw new BadRequestException('A ação de criar tarefa exige "assignToId" (usuário responsável válido)');
      }
      const user = await this.prisma.user.findUnique({ where: { id: assignToId } });
      if (!user) throw new BadRequestException('Usuário responsável (assignToId) não encontrado');
    }
  }
}
