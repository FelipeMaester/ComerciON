import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { QueryServiceOrdersDto, SituacaoDaOrdem } from './dto/query-service-orders.dto';
import { paginated, toSkipTake } from '../common/pagination/pagination.dto';
import { filtroDeOrdemAtrasada } from '../common/ordem-atrasada';

const SERVICE_ORDER_INCLUDE = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
  vehicle: true,
  items: { include: { product: { select: { id: true, name: true, sku: true } } } },
  quote: { select: { id: true, createdAt: true } },
  sale: { select: { id: true, status: true } },
} as const;

@Injectable()
export class ServiceOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesService: SalesService,
  ) {}

  async findAll(query: QueryServiceOrdersDto) {
    const { skip, take, page, pageSize } = toSkipTake(query);
    const onde = this.filtroDaSituacao(query.situacao ?? 'ABERTAS', query.search);

    const [ordens, total] = await Promise.all([
      this.prisma.serviceOrder.findMany({
        where: onde,
        include: {
          customer: { select: { name: true } },
          vehicle: { select: { plate: true } },
          sale: { select: { id: true } },
        },
        // A ordem que a tela montava no navegador, agora no banco: agendadas
        // primeiro, na hora do compromisso; sem data marcada vão para o fim,
        // e entre elas a mais recente primeiro.
        orderBy: [
          { scheduledAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip,
        take,
      }),
      this.prisma.serviceOrder.count({ where: onde }),
    ]);
    return paginated(ordens, total, page, pageSize);
  }

  /**
   * Quantas ordens há em cada situação — contadas no banco.
   *
   * A tela mostra o número ao lado de cada filtro ("Atrasadas 7") e os obtinha
   * contando a lista carregada. Numa lista paginada isso passaria a contar
   * apenas a página: sete atrasadas viraria "2", e ninguém teria motivo para
   * desconfiar do número.
   */
  async contagens() {
    const situacoes = ['ABERTAS', 'ATRASADAS', ...Object.values(ServiceOrderStatus)] as const;
    const numeros = await Promise.all(
      situacoes.map((situacao) =>
        this.prisma.serviceOrder.count({ where: this.filtroDaSituacao(situacao) }),
      ),
    );
    return Object.fromEntries(situacoes.map((situacao, i) => [situacao, numeros[i]])) as Record<
      (typeof situacoes)[number],
      number
    >;
  }

  private filtroDaSituacao(situacao: SituacaoDaOrdem, busca?: string): Prisma.ServiceOrderWhereInput {
    const termo = busca?.trim();
    return {
      ...(situacao === 'ABERTAS'
        ? { status: { in: [ServiceOrderStatus.OPEN, ServiceOrderStatus.IN_PROGRESS] } }
        : situacao === 'ATRASADAS'
          ? // A mesma regra que o sino de avisos usa, do mesmo arquivo: quando
            // cada um tinha a sua cópia, bastava mexer em uma para os dois
            // números discordarem na cara do lojista.
            filtroDeOrdemAtrasada()
          : { status: situacao }),
      ...(termo
        ? {
            OR: [
              { customer: { name: { contains: termo, mode: 'insensitive' } } },
              { vehicle: { plate: { contains: termo, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  async findOne(id: string) {
    const serviceOrder = await this.prisma.serviceOrder.findUnique({ where: { id }, include: SERVICE_ORDER_INCLUDE });
    if (!serviceOrder) throw new NotFoundException('Ordem de serviço não encontrada');
    return serviceOrder;
  }

  /**
   * Muda o status e, ao concluir, gera a venda correspondente (confirmada,
   * mas sem pagamento — fica pendente no Financeiro).
   *
   * A conclusão é REIVINDICADA antes de gerar a venda. Conferir `saleId` em
   * memória e só depois criar não segura nada: medido, quatro pessoas
   * marcando "concluído" ao mesmo tempo numa ordem de R$ 600 geraram quatro
   * vendas, R$ 2.400 a receber e oito unidades baixadas em vez de duas. O
   * `saleId @unique` do schema não impede isso, porque são quatro saleId
   * DIFERENTES — a restrição só impede duas ordens apontarem para a mesma
   * venda, não uma ordem ser sobrescrita quatro vezes.
   *
   * Marcar DONE de novo numa ordem já concluída continua funcionando e não
   * gera segunda venda: quem chega depois afeta zero linhas na reivindicação
   * e segue direto para a resposta.
   */
  async updateStatus(id: string, status: ServiceOrderStatus) {
    const serviceOrder = await this.prisma.serviceOrder.findUnique({ where: { id }, include: { items: true } });
    if (!serviceOrder) throw new NotFoundException('Ordem de serviço não encontrada');

    if (status !== ServiceOrderStatus.DONE) {
      return this.prisma.serviceOrder.update({ where: { id }, data: { status }, include: SERVICE_ORDER_INCLUDE });
    }

    const { count } = await this.prisma.serviceOrder.updateMany({
      where: { id, status: { not: ServiceOrderStatus.DONE } },
      data: { status: ServiceOrderStatus.DONE },
    });

    // Já estava concluída (ou outra requisição concluiu primeiro): nada a
    // gerar. A ordem pode estar sem venda de propósito — é o caso de quando o
    // status foi e voltou —, e nesse caso o vínculo é feito pela reivindicação
    // que de fato concluiu, não por esta.
    if (count === 0) {
      return this.prisma.serviceOrder.findUniqueOrThrow({ where: { id }, include: SERVICE_ORDER_INCLUDE });
    }

    if (!serviceOrder.saleId) {
      try {
        const sale = await this.salesService.createFromServiceOrder(serviceOrder);
        await this.prisma.serviceOrder.update({ where: { id }, data: { saleId: sale.id } });
      } catch (erro) {
        // Sem isto, uma falha ao gerar a venda deixaria a ordem concluída e
        // sem nada a receber — e a tentativa seguinte veria "já concluída" e
        // nunca mais geraria a venda. Voltar o status mantém o retry vivo.
        await this.prisma.serviceOrder.update({ where: { id }, data: { status: serviceOrder.status } });
        throw erro;
      }
    }

    return this.prisma.serviceOrder.findUniqueOrThrow({ where: { id }, include: SERVICE_ORDER_INCLUDE });
  }

  async schedule(id: string, scheduledAt: string | undefined) {
    const serviceOrder = await this.prisma.serviceOrder.findUnique({ where: { id } });
    if (!serviceOrder) throw new NotFoundException('Ordem de serviço não encontrada');

    return this.prisma.serviceOrder.update({
      where: { id },
      data: { scheduledAt: scheduledAt ? new Date(scheduledAt) : null },
      include: SERVICE_ORDER_INCLUDE,
    });
  }
}
