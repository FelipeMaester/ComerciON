import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AutomationAction, AutomationTrigger, Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { ACTION_CATALOG, TRIGGER_CATALOG, TRIGGERS_REQUIRING_DAYS, buildCatalogResponse } from './automation-catalog';
import { CreateAutomationRuleDto } from './dto/create-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-rule.dto';

/**
 * CRUD das regras de automação. Cada regra tem um catálogo fixo de
 * gatilhos/ações (não é um motor de condições livres) — a validação de
 * `triggerConfig`/`actionConfig` acontece aqui, na criação/edição, pra nunca
 * deixar uma regra mal configurada chegar no motor de execução.
 *
 * Fase F: a validação passou a ser derivada de automation-catalog.ts em vez de
 * repetir as regras à mão. Acrescentar um gatilho ao catálogo já o torna
 * validável, exposto na API e renderizável na tela, sem tocar aqui.
 */
@Injectable()
export class AutomationRulesService {
  constructor(private readonly prisma: PrismaService) {}

  getCatalog() {
    return buildCatalogResponse();
  }

  async create(dto: CreateAutomationRuleDto) {
    await this.validateConfig(dto.trigger, dto.triggerConfig, dto.action, dto.actionConfig);
    return this.prisma.automationRule.create({
      data: {
        name: dto.name,
        trigger: dto.trigger,
        triggerConfig: (dto.triggerConfig ?? null) as Prisma.InputJsonValue,
        action: dto.action,
        actionConfig: dto.actionConfig as Prisma.InputJsonValue,
        cooldownDays: dto.cooldownDays ?? null,
        isActive: dto.isActive ?? true,
      } as Prisma.AutomationRuleUncheckedCreateInput,
    });
  }

  /**
   * Lista as regras já com o resumo de execução embutido. Antes a tela só
   * conseguia esse número abrindo regra por regra ("Ver execuções"), então
   * uma automação quebrada podia ficar falhando em silêncio por semanas.
   * Duas agregações no banco em vez de uma consulta por regra (N+1).
   */
  async findAll() {
    const rules = await this.prisma.automationRule.findMany({ orderBy: { createdAt: 'desc' } });
    if (rules.length === 0) return [];

    const ruleIds = rules.map((r) => r.id);
    const [totals, failures] = await Promise.all([
      this.prisma.automationRunLog.groupBy({
        by: ['ruleId'],
        where: { ruleId: { in: ruleIds } },
        _count: true,
        _max: { firedAt: true },
      }),
      this.prisma.automationRunLog.groupBy({
        by: ['ruleId'],
        where: { ruleId: { in: ruleIds }, success: false },
        _count: true,
      }),
    ]);

    const totalById = new Map(totals.map((t) => [t.ruleId, t]));
    const failuresById = new Map(failures.map((f) => [f.ruleId, f._count]));

    return rules.map((rule) => ({
      ...rule,
      stats: {
        runCount: totalById.get(rule.id)?._count ?? 0,
        failureCount: failuresById.get(rule.id) ?? 0,
        lastFiredAt: totalById.get(rule.id)?._max.firedAt ?? null,
      },
    }));
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
        cooldownDays: dto.cooldownDays,
        isActive: dto.isActive,
      },
    });
  }

  /**
   * Exclusão de verdade (não só desativar): o histórico de execuções vai
   * junto por onDelete: Cascade — quem quer preservar o histórico desativa a
   * regra em vez de excluir, e a tela deixa isso claro na confirmação.
   */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.automationRule.delete({ where: { id } });
    return { id, deleted: true };
  }

  async listRuns(ruleId: string, limit = 50) {
    await this.findOne(ruleId);
    return this.prisma.automationRunLog.findMany({
      where: { ruleId },
      orderBy: { firedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Valida contra o catálogo. `days` e os campos de cada ação não estão mais
   * escritos à mão aqui — vêm de automation-catalog.ts, que é o mesmo objeto
   * que a tela usa pra desenhar o formulário. Não tem como a tela pedir um
   * campo que o backend não valida, nem o contrário.
   */
  private async validateConfig(
    trigger: AutomationTrigger,
    triggerConfig: Record<string, unknown> | undefined,
    action: AutomationAction,
    actionConfig: Record<string, unknown>,
  ) {
    if (TRIGGERS_REQUIRING_DAYS.has(trigger)) {
      const days = triggerConfig?.days;
      if (typeof days !== 'number' || !Number.isInteger(days) || days <= 0) {
        throw new BadRequestException('Este gatilho exige "days" (número inteiro positivo) na configuração');
      }
    }

    // Combinação impossível: gatilho sobre um registro sem cliente (estoque
    // baixo dispara sobre um produto) com uma ação que manda mensagem pro
    // cliente. Barrado no cadastro em vez de falhar na madrugada seguinte.
    if (ACTION_CATALOG[action].contactsCustomer && !TRIGGER_CATALOG[trigger].hasCustomer) {
      throw new BadRequestException(
        `O gatilho "${TRIGGER_CATALOG[trigger].label}" não tem um cliente associado, então não dá pra usar a ação "${ACTION_CATALOG[action].label}". Use "Criar tarefa" para avisar a equipe.`,
      );
    }

    for (const field of ACTION_CATALOG[action].fields) {
      if (!field.required) continue;
      const value = actionConfig?.[field.key];
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new BadRequestException(`A ação "${ACTION_CATALOG[action].label}" exige "${field.label}"`);
      }
      // O tipo 'user' é o único que precisa bater com um registro real —
      // uma regra apontando pra um usuário inexistente falharia só no
      // disparo, horas depois, num log que ninguém está olhando.
      if (field.type === 'user') {
        if (!isUUID(value)) {
          throw new BadRequestException(`"${field.label}" precisa ser um usuário válido`);
        }
        const user = await this.prisma.user.findUnique({ where: { id: value } });
        if (!user) throw new BadRequestException(`Usuário informado em "${field.label}" não encontrado`);
      }
    }
  }
}
