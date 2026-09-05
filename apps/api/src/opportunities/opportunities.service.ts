import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AutomationEntityType, OpportunityStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationEngineService } from '../automations/automation-engine.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { MoveStageDto } from './dto/move-stage.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { DEFAULT_PAGE_SIZE } from '../common/pagination/pagination.dto';

const OPPORTUNITY_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true, email: true } },
  stage: true,
  responsible: { select: { id: true, name: true } },
} as const;

/**
 * Cartões por coluna no quadro. Mesmo número da paginação do resto do
 * sistema: o quadro é para trabalhar o que está em aberto, não para folhear
 * o histórico — quem quer o histórico tem a contagem no cabeçalho da coluna.
 */
const LIMITE_POR_ETAPA = DEFAULT_PAGE_SIZE;

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automationEngine: AutomationEngineService,
  ) {}

  async findStages() {
    return this.prisma.pipelineStage.findMany({ orderBy: { order: 'asc' } });
  }

  async create(dto: CreateOpportunityDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    const stage = dto.stageId
      ? await this.prisma.pipelineStage.findUnique({ where: { id: dto.stageId } })
      : await this.prisma.pipelineStage.findFirst({ orderBy: { order: 'asc' } });
    if (!stage) throw new BadRequestException('Nenhuma etapa de funil configurada para este tenant');

    return this.prisma.opportunity.create({
      data: {
        customerId: dto.customerId,
        stageId: stage.id,
        title: dto.title,
        estimatedValue: dto.estimatedValue,
        responsibleId: dto.responsibleId,
        source: dto.source,
        tags: dto.tags ?? [],
      } as Prisma.OpportunityUncheckedCreateInput,
      include: OPPORTUNITY_INCLUDE,
    });
  }

  /**
   * O quadro do funil: cartões limitados por etapa, números da loja inteira.
   *
   * Antes devolvia TODAS as oportunidades e a tela distribuía por etapa no
   * navegador. Um funil saudável tem poucas oportunidades abertas — mas as
   * etapas terminais ("Ganho" e "Perdido") nunca esvaziam: nada sai delas.
   *
   * Medido com dois anos de funil (1.200 oportunidades): 966 KB de resposta,
   * dos quais 75% eram negócios já fechados, e uma página de 61.698 pixels —
   * 68 telas de rolagem, porque a coluna "Ganho" empilhava 480 cartões.
   *
   * O RESUMO É SEPARADO DE PROPÓSITO. O cabeçalho de cada coluna mostra a
   * contagem e a soma, e a tela as calculava sobre o array recebido. Limitar
   * os cartões sem trazer os totais do banco transformaria uma tela pesada
   * numa tela MENTIROSA: a coluna diria "25" e "R$ 12.000" onde a loja tem
   * 480 negócios e meio milhão.
   */
  async findAll(porEtapa = LIMITE_POR_ETAPA) {
    // Contagem e soma por etapa, da loja inteira. Uma consulta só.
    const resumo = await this.prisma.opportunity.groupBy({
      by: ['stageId'],
      _count: { _all: true },
      _sum: { estimatedValue: true },
    });

    // Os cartões, no máximo `porEtapa` por coluna. Uma consulta por etapa que
    // TEM oportunidade — o Prisma não sabe limitar por grupo, e uma consulta
    // indexada e limitada por coluna custa menos que trazer a tabela toda.
    const porColuna = await Promise.all(
      resumo.map((r) =>
        this.prisma.opportunity.findMany({
          where: { stageId: r.stageId },
          include: OPPORTUNITY_INCLUDE,
          orderBy: { stageChangedAt: 'desc' },
          take: porEtapa,
        }),
      ),
    );

    return {
      items: porColuna.flat(),
      resumo: resumo.map((r) => ({
        stageId: r.stageId,
        total: r._count._all,
        valor: Number(r._sum.estimatedValue ?? 0),
      })),
    };
  }

  async findOne(id: string) {
    const opportunity = await this.prisma.opportunity.findUnique({ where: { id }, include: OPPORTUNITY_INCLUDE });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada');
    return opportunity;
  }

  async update(id: string, dto: UpdateOpportunityDto) {
    await this.findOne(id);
    return this.prisma.opportunity.update({
      where: { id },
      data: {
        title: dto.title,
        estimatedValue: dto.estimatedValue,
        responsibleId: dto.responsibleId,
        source: dto.source,
        tags: dto.tags,
      },
      include: OPPORTUNITY_INCLUDE,
    });
  }

  /** Usado tanto pelo drag-and-drop do Kanban quanto por qualquer troca manual de etapa. */
  async moveStage(id: string, dto: MoveStageDto) {
    await this.findOne(id);
    const stage = await this.prisma.pipelineStage.findUnique({ where: { id: dto.stageId } });
    if (!stage) throw new NotFoundException('Etapa não encontrada');

    const status = stage.isWonStage ? OpportunityStatus.WON : stage.isLostStage ? OpportunityStatus.LOST : OpportunityStatus.OPEN;

    const updated = await this.prisma.opportunity.update({
      where: { id },
      data: {
        stageId: stage.id,
        stageChangedAt: new Date(),
        status,
        // Limpa wonAt/lostAt ao sair da etapa correspondente — evita datas
        // "fantasma" se o card for arrastado de volta por engano.
        wonAt: status === OpportunityStatus.WON ? new Date() : null,
        lostAt: status === OpportunityStatus.LOST ? new Date() : null,
      },
      include: OPPORTUNITY_INCLUDE,
    });

    if (status === OpportunityStatus.WON) {
      await this.automationEngine.fireEvent('OPPORTUNITY_WON', AutomationEntityType.OPPORTUNITY, id);
    } else if (status === OpportunityStatus.LOST) {
      await this.automationEngine.fireEvent('OPPORTUNITY_LOST', AutomationEntityType.OPPORTUNITY, id);
    }

    return updated;
  }

  async markLost(id: string, reason?: string) {
    await this.findOne(id);
    const lostStage = await this.prisma.pipelineStage.findFirst({ where: { isLostStage: true } });
    if (!lostStage) throw new BadRequestException('Nenhuma etapa de "perdido" configurada para este tenant');

    const updated = await this.prisma.opportunity.update({
      where: { id },
      data: {
        stageId: lostStage.id,
        status: OpportunityStatus.LOST,
        lostAt: new Date(),
        lostReason: reason,
        stageChangedAt: new Date(),
      },
      include: OPPORTUNITY_INCLUDE,
    });

    await this.automationEngine.fireEvent('OPPORTUNITY_LOST', AutomationEntityType.OPPORTUNITY, id);

    return updated;
  }
}
