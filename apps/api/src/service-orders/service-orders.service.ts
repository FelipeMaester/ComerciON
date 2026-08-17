import { Injectable, NotFoundException } from '@nestjs/common';
import { ServiceOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';

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

  async findAll() {
    return this.prisma.serviceOrder.findMany({
      include: {
        customer: { select: { name: true } },
        vehicle: { select: { plate: true } },
        sale: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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
