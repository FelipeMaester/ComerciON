import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OpportunityStatus, Prisma, Quote, QuoteStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { QueryQuotesDto } from './dto/query-quotes.dto';
import { paginated, toSkipTake } from '../common/pagination/pagination.dto';
import { dataOpcionalDaConsulta } from '../common/data-da-consulta';
import { exigirTransicao } from '../common/transicao-de-estado';

// serviceOrder traz status/agendamento/venda aqui mesmo — a tela do
// orçamento é a única tela do fluxo completo, sem precisar buscar a ordem de
// serviço numa página separada (ver QuotesController/frontend). O total e os
// pagamentos da venda vêm junto para o front conseguir calcular se já foi
// paga sem uma segunda chamada — é o que decide o status unificado exibido
// (getQuoteFlowStatus), então tanto a lista quanto o detalhe usam este mesmo
// select de serviceOrder.sale.
const SERVICE_ORDER_SELECT = {
  id: true,
  status: true,
  scheduledAt: true,
  sale: { select: { id: true, status: true, total: true, payments: { select: { amount: true } } } },
} as const;

const QUOTE_INCLUDE = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  vehicle: true,
  items: { include: { product: { select: { id: true, name: true, sku: true } } } },
  serviceOrder: { select: SERVICE_ORDER_SELECT },
} as const;

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateQuoteDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    if (dto.vehicleId) {
      const vehicle = await this.prisma.customerVehicle.findUnique({ where: { id: dto.vehicleId } });
      if (!vehicle || vehicle.customerId !== dto.customerId) {
        throw new BadRequestException('Veículo não pertence a este cliente');
      }
    }

    const total = dto.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.create({
        data: {
          customerId: dto.customerId,
          vehicleId: dto.vehicleId,
          opportunityId: dto.opportunityId,
          description: dto.description,
          total,
        } as Prisma.QuoteUncheckedCreateInput,
      });

      await tx.quoteItem.createMany({
        data: dto.items.map((item) => ({
          quoteId: quote.id,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })) as Prisma.QuoteItemUncheckedCreateInput[],
      });

      return tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: QUOTE_INCLUDE });
    });
  }

  async findAll(query: QueryQuotesDto) {
    const { skip, take, page, pageSize } = toSkipTake(query);
    const busca = query.search?.trim();
    const onde: Prisma.QuoteWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      // "Só os agendados" era um filtro de tela sobre a lista inteira. Sobre
      // uma lista paginada, filtro de tela mostraria "os agendados desta
      // página" — que é uma resposta plausível e errada.
      ...(query.agenda ? { serviceOrder: { scheduledAt: { not: null } } } : {}),
      ...(busca
        ? {
            OR: [
              { customer: { name: { contains: busca, mode: 'insensitive' } } },
              { vehicle: { plate: { contains: busca, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [quotes, total] = await Promise.all([
      this.prisma.quote.findMany({
        where: onde,
        include: {
          customer: { select: { name: true } },
          vehicle: { select: { plate: true } },
          serviceOrder: { select: SERVICE_ORDER_SELECT },
        },
        // Na agenda a ordem é a do compromisso; no resto, o mais recente
        // primeiro. Desempate por id para a página 2 não repetir nem pular.
        orderBy: query.agenda
          ? [{ serviceOrder: { scheduledAt: 'asc' } }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.quote.count({ where: onde }),
    ]);
    return paginated(quotes, total, page, pageSize);
  }

  /**
   * Os orçamentos aprovados depois de um instante.
   *
   * Existe para o aviso de "o cliente aprovou" que a tela mostra: ela
   * perguntava isso baixando a lista inteira a cada 15 segundos e comparando
   * com a cópia anterior — 1,6 MB por consulta numa loja com 3.000
   * orçamentos, 6,4 MB por minuto de aba aberta.
   *
   * Sem `desde`, não devolve nada: a tela pergunta "o que mudou desde que eu
   * abri", e responder "tudo o que já foi aprovado na história da loja" faria
   * o aviso pipocar para orçamentos aprovados no ano passado.
   */
  async aprovadosDesde(desde?: string) {
    // `new Date(...)` direto não serve: "2026-09-06T00" passa pelo @IsISO8601 e
    // vira Invalid Date em silêncio, que o Prisma rejeita lá na frente com 500.
    // Medido: `?desde=banana` respondia 400 e `?desde=2026-09-06T00`, 500 — o
    // mesmo tipo de lixo, duas respostas diferentes, e uma delas culpando o
    // servidor. O helper é o mesmo que os relatórios usam.
    const marca = dataOpcionalDaConsulta(desde, 'desde');
    if (!marca) return [];
    return this.prisma.quote.findMany({
      where: { status: QuoteStatus.APPROVED, approvedAt: { gt: marca } },
      select: {
        id: true,
        total: true,
        approvedAt: true,
        customer: { select: { name: true } },
      },
      orderBy: { approvedAt: 'asc' },
      // Teto de segurança: se a tela ficar horas sem perguntar, o aviso não
      // pode virar uma avalanche de cartões na tela.
      take: 20,
    });
  }

  async findOne(id: string) {
    const quote = await this.prisma.quote.findUnique({ where: { id }, include: QUOTE_INCLUDE });
    if (!quote) throw new NotFoundException('Orçamento não encontrado');
    return quote;
  }

  /** Rota pública (link enviado ao cliente) — resolvido pelo publicToken, não exige login. */
  async findByPublicToken(token: string) {
    const quote = await this.prisma.quote.findUnique({ where: { publicToken: token }, include: QUOTE_INCLUDE });
    if (!quote) throw new NotFoundException('Orçamento não encontrado');
    return quote;
  }

  async approveByToken(token: string) {
    const quote = await this.prisma.quote.findUnique({ where: { publicToken: token }, include: { items: true } });
    if (!quote) throw new NotFoundException('Orçamento não encontrado');
    return this.approve(quote);
  }

  /** Aprovação manual pela equipe (ex.: cliente aprovou por telefone/presencialmente) — mesmo efeito da aprovação pelo link público. */
  async approveById(id: string) {
    const quote = await this.prisma.quote.findUnique({ where: { id }, include: { items: true } });
    if (!quote) throw new NotFoundException('Orçamento não encontrado');
    return this.approve(quote);
  }

  private async approve(quote: Prisma.QuoteGetPayload<{ include: { items: true } }>) {
    return this.prisma.$transaction(async (tx) => {
      // Reivindica a resposta antes de abrir a ordem de serviço. Conferir o
      // status em memória deixava aprovar e recusar passarem ao mesmo tempo:
      // medido, o orçamento terminou RECUSADO com uma ordem de serviço aberta
      // — a oficina executando um serviço que o cliente recusou.
      await exigirTransicao(
        tx.quote.updateMany({
          where: { id: quote.id, status: QuoteStatus.PENDING },
          data: { status: QuoteStatus.APPROVED, approvedAt: new Date() },
        }),
        'Este orçamento já foi respondido',
      );

      // tenantId explícito: essa rota é pública (sem token JWT, sem contexto
      // ambiente garantido), então não dá pra confiar só na injeção
      // automática do middleware — usamos o tenant do próprio orçamento.
      const serviceOrder = await tx.serviceOrder.create({
        data: {
          tenantId: quote.tenantId,
          quoteId: quote.id,
          customerId: quote.customerId,
          vehicleId: quote.vehicleId,
          description: quote.description,
          total: quote.total,
        } as Prisma.ServiceOrderUncheckedCreateInput,
      });

      await tx.serviceOrderItem.createMany({
        data: quote.items.map((item) => ({
          tenantId: quote.tenantId,
          serviceOrderId: serviceOrder.id,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })) as Prisma.ServiceOrderItemUncheckedCreateInput[],
      });

      // Fecha o funil: orçamento aprovado, se veio de uma oportunidade,
      // move ela pra etapa de "ganho" — mesma lógica de tenantId explícito
      // acima (rota pública, sem contexto de tenant garantido).
      if (quote.opportunityId) {
        const wonStage = await tx.pipelineStage.findFirst({
          where: { tenantId: quote.tenantId, isWonStage: true },
        });
        if (wonStage) {
          await tx.opportunity.update({
            where: { id: quote.opportunityId },
            data: { stageId: wonStage.id, status: OpportunityStatus.WON, wonAt: new Date(), stageChangedAt: new Date() },
          });
        }
      }

      return tx.serviceOrder.findUniqueOrThrow({
        where: { id: serviceOrder.id },
        include: { items: true },
      });
    });
  }

  async rejectByToken(token: string) {
    const quote = await this.prisma.quote.findUnique({ where: { publicToken: token } });
    if (!quote) throw new NotFoundException('Orçamento não encontrado');
    return this.reject(quote);
  }

  /** Recusa manual pela equipe — mesmo efeito da recusa pelo link público. */
  async rejectById(id: string) {
    const quote = await this.prisma.quote.findUnique({ where: { id } });
    if (!quote) throw new NotFoundException('Orçamento não encontrado');
    return this.reject(quote);
  }

  private async reject(quote: Quote) {
    return this.prisma.$transaction(async (tx) => {
      // Mesma reivindicação do approve(): quem chegar depois afeta zero linhas.
      await exigirTransicao(
        tx.quote.updateMany({
          where: { id: quote.id, status: QuoteStatus.PENDING },
          data: { status: QuoteStatus.REJECTED, rejectedAt: new Date() },
        }),
        'Este orçamento já foi respondido',
      );
      const updated = await tx.quote.findUniqueOrThrow({ where: { id: quote.id } });

      // Simétrico ao approve(): orçamento recusado, se veio de uma
      // oportunidade, move ela pra etapa de "perdido".
      if (quote.opportunityId) {
        const lostStage = await tx.pipelineStage.findFirst({
          where: { tenantId: quote.tenantId, isLostStage: true },
        });
        if (lostStage) {
          await tx.opportunity.update({
            where: { id: quote.opportunityId },
            data: { stageId: lostStage.id, status: OpportunityStatus.LOST, lostAt: new Date(), stageChangedAt: new Date() },
          });
        }
      }

      return updated;
    });
  }
}
