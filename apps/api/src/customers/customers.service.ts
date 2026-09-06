import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialEntryStatus, FinancialEntryType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Paginated, montarOrdenacao, paginated, toSkipTake } from '../common/pagination/pagination.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateCustomerVehicleDto } from './dto/create-customer-vehicle.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { estaVencida } from '../common/vencimento';
import { inicioDeHoje } from '../common/ordem-atrasada';

/**
 * Quantos itens de cada tipo a ficha do cliente mostra.
 *
 * Dez, e não todos: a ficha do cliente antigo — a oficina que compra três
 * vezes por semana há três anos — baixava 922.204 bytes e levava 845 ms,
 * porque trazia as 460 vendas com itens e pagamentos e os 120 orçamentos com
 * itens e produtos. E essa é a tela que o balconista abre COM O CLIENTE
 * esperando na frente dele.
 *
 * Dez cobre a pergunta que se faz no balcão: o que ele levou por último. O
 * resto vive nas telas próprias, e a ficha informa quantos são — para ninguém
 * confundir "as dez mais recentes" com "tudo o que existe".
 */
const RECENTES_NA_FICHA = 10;

/** Maiúsculas, sem hífen/espaços — mesma placa não deve virar dois registros por causa de formatação. */
function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Colunas da tela de clientes que o banco sabe ordenar.
 *
 * Lista branca: a chave é o nome que a tela usa, o valor é o campo real. O que
 * não estiver aqui a tela ordena sozinha, só na página carregada — e avisa.
 */
const ORDENAVEIS: Record<string, string> = {
  nome: 'name',
  tipo: 'type',
  documento: 'document',
  segmento: 'segment',
  status: 'isActive',
};

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustomerDto) {
    if (dto.document) {
      const existing = await this.prisma.customer.findFirst({ where: { document: dto.document } });
      if (existing) throw new ConflictException('Já existe um cliente com este documento');
    }
    return this.prisma.customer.create({ data: dto as Prisma.CustomerUncheckedCreateInput });
  }

  async findAll(query: QueryCustomersDto): Promise<Paginated<unknown>> {
    const { search } = query;
    const { skip, take, page, pageSize } = toSkipTake(query);
    // Busca também por telefone e documento: no balcão, quem atende costuma ter
    // o telefone do cliente na tela, não o nome exato como foi cadastrado.
    const where: Prisma.CustomerWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
            { document: { contains: search } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({ where, orderBy: montarOrdenacao(query, ORDENAVEIS, { name: 'asc' }), skip, take }),
      this.prisma.customer.count({ where }),
    ]);

    return paginated(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        addresses: { orderBy: { createdAt: 'asc' } },
        vehicles: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.assertExists(id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async setActive(id: string, isActive: boolean) {
    await this.assertExists(id);
    return this.prisma.customer.update({ where: { id }, data: { isActive } });
  }

  async addAddress(customerId: string, dto: CreateCustomerAddressDto) {
    await this.assertExists(customerId);
    if (dto.isDefault) {
      await this.prisma.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    return this.prisma.customerAddress.create({
      data: { ...dto, customerId } as Prisma.CustomerAddressUncheckedCreateInput,
    });
  }

  async removeAddress(customerId: string, addressId: string) {
    const address = await this.prisma.customerAddress.findUnique({ where: { id: addressId } });
    if (!address || address.customerId !== customerId) {
      throw new NotFoundException('Endereço não encontrado');
    }
    await this.prisma.customerAddress.delete({ where: { id: addressId } });
  }

  async addVehicle(customerId: string, dto: CreateCustomerVehicleDto) {
    await this.assertExists(customerId);
    return this.prisma.customerVehicle.create({
      data: { ...dto, customerId, plate: normalizePlate(dto.plate) } as Prisma.CustomerVehicleUncheckedCreateInput,
    });
  }

  /**
   * Histórico do cliente: "Serviços" são os orçamentos (cada um já carrega a
   * ordem de serviço e a venda gerada, se houver — mesmo padrão do
   * QuotesService). "Compras" são vendas do cliente que não vieram de um
   * orçamento (PDV/loja), pra não listar a mesma venda duas vezes.
   */
  /**
   * O quanto o cliente deve, em duas consultas.
   *
   * Existe separado de `getCustomerHistory` por causa de onde é usado: o
   * histórico completo faz seis consultas (vendas com itens e pagamentos,
   * ordens, oportunidades, tarefas) e serve para a ficha, que se abre uma vez.
   * O balcão pergunta isto a cada cliente escolhido, no meio do atendimento —
   * pagar seis consultas para mostrar duas linhas seria caro no lugar errado.
   *
   * O que o balcão precisa saber antes de fechar um fiado: quanto está em
   * aberto, quanto disso já venceu, e qual é o teto. Sem isso a recusa por
   * limite só aparece ao finalizar, com o cliente na frente — que é o momento
   * mais caro possível para descobrir.
   */
  async getCredito(customerId: string) {
    const cliente = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, creditLimit: true, paymentTermDays: true },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');

    // Mesma definição de "em aberto" que a ficha do cliente e a conferência de
    // limite usam: toda conta a receber pendente, venha de venda ou de serviço.
    // Três lugares dando números diferentes para a mesma pergunta seria pior
    // que não mostrar nenhum.
    const pendentes = await this.prisma.financialEntry.findMany({
      where: { customerId, type: 'RECEIVABLE', status: 'PENDING' },
      select: { amount: true, dueDate: true },
    });

    const agora = new Date();
    const soma = (lista: typeof pendentes) =>
      Math.round(lista.reduce((total, e) => total + Number(e.amount), 0) * 100) / 100;

    return {
      customerId: cliente.id,
      name: cliente.name,
      emAberto: soma(pendentes),
      vencido: soma(pendentes.filter((e) => estaVencida(e.dueDate, agora))),
      limite: cliente.creditLimit === null ? null : Number(cliente.creditLimit),
      prazoPadrao: cliente.paymentTermDays,
    };
  }

  async getCustomerHistory(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, name: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    const ondeVendas: Prisma.SaleWhereInput = { customerId, serviceOrder: null };
    const [quotes, sales, opportunities, tasks, totais] = await Promise.all([
      this.prisma.quote.findMany({
        where: { customerId },
        include: {
          vehicle: { select: { id: true, plate: true } },
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          serviceOrder: {
            select: {
              id: true,
              status: true,
              scheduledAt: true,
              sale: { select: { id: true, status: true, total: true, payments: { select: { amount: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: RECENTES_NA_FICHA,
      }),
      this.prisma.sale.findMany({
        where: ondeVendas,
        include: { items: true, payments: true },
        orderBy: { createdAt: 'desc' },
        take: RECENTES_NA_FICHA,
      }),
      this.prisma.opportunity.findMany({
        where: { customerId },
        include: { stage: { select: { id: true, name: true, isWonStage: true, isLostStage: true } }, responsible: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: RECENTES_NA_FICHA,
      }),
      this.prisma.task.findMany({
        where: { customerId },
        include: { assignedTo: { select: { id: true, name: true } } },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
        take: RECENTES_NA_FICHA,
      }),
      this.contarHistorico(customerId, ondeVendas),
    ]);

    return {
      customer,
      quotes,
      sales,
      opportunities,
      tasks,
      // Quantos existem ao todo, para a tela poder dizer "as 10 mais recentes
      // de 460" em vez de deixar quem lê achar que são 10.
      totais,
      ...(await this.saldoDoCliente(customerId)),
    };
  }

  /**
   * O que o cliente deve — somado no BANCO.
   *
   * Era somado em memória, sobre a lista inteira de contas pendentes. Ao pôr
   * teto nessa lista (a ficha do cliente antigo baixava 922 KB), a soma
   * passaria a considerar só as que couberam: a dívida apareceria MENOR do
   * que é, num número redondo e convincente. É a pior falha possível nesta
   * tela — ela existe justamente para decidir se dá para vender fiado de novo.
   */
  private async saldoDoCliente(customerId: string) {
    const onde = { customerId, type: FinancialEntryType.RECEIVABLE, status: FinancialEntryStatus.PENDING };
    const [tudo, vencido] = await Promise.all([
      this.prisma.financialEntry.aggregate({ where: onde, _sum: { amount: true } }),
      this.prisma.financialEntry.aggregate({
        // Mesma regra de "vencida" do resto do sistema: antes do começo de
        // hoje. Conta que vence hoje ainda não está vencida.
        where: { ...onde, dueDate: { lt: inicioDeHoje() } },
        _sum: { amount: true },
      }),
    ]);
    return {
      outstandingBalance: Math.round(Number(tudo._sum.amount ?? 0) * 100) / 100,
      overdueBalance: Math.round(Number(vencido._sum.amount ?? 0) * 100) / 100,
    };
  }

  /** Quantos há de cada coisa no histórico do cliente. */
  private async contarHistorico(customerId: string, ondeVendas: Prisma.SaleWhereInput) {
    const [quotes, sales, opportunities, tasks] = await Promise.all([
      this.prisma.quote.count({ where: { customerId } }),
      this.prisma.sale.count({ where: ondeVendas }),
      this.prisma.opportunity.count({ where: { customerId } }),
      this.prisma.task.count({ where: { customerId } }),
    ]);
    return { quotes, sales, opportunities, tasks };
  }

  /** Histórico do veículo: todos os orçamentos e ordens de serviço já feitos nele, mais recentes primeiro. */
  async getVehicleHistory(vehicleId: string) {
    const vehicle = await this.prisma.customerVehicle.findUnique({
      where: { id: vehicleId },
      include: {
        customer: { select: { id: true, name: true } },
        quotes: {
          include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
          orderBy: { createdAt: 'desc' },
        },
        serviceOrders: {
          include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado');
    return vehicle;
  }

  private async assertExists(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }
}
