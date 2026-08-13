import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AutomationEntityType, Prisma, PrismaClient, SaleChannel, SaleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../inventory/stock.service';
import { CouponsService } from '../coupons/coupons.service';
import { AutomationsService } from '../whatsapp/automations.service';
import { AutomationEngineService } from '../automations/automation-engine.service';
import { ShipmentsService } from '../logistics/shipments.service';
import { CashService } from '../cash/cash.service';
import { Paginated, paginated, toSkipTake } from '../common/pagination/pagination.dto';
import { QuerySalesDto } from './dto/query-sales.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SalePaymentDto } from './dto/sale-payment.dto';

type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

interface ResolvedSaleItem {
  productId?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger('SalesService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockService: StockService,
    private readonly couponsService: CouponsService,
    private readonly automationsService: AutomationsService,
    private readonly automationEngine: AutomationEngineService,
    private readonly shipmentsService: ShipmentsService,
    private readonly cashService: CashService,
  ) {}

  /**
   * Histórico de vendas paginado. Esta é a tabela que mais cresce no sistema —
   * uma loja com movimento passa de dezenas de milhares de linhas no primeiro
   * ano, e cada linha traz itens e pagamentos junto.
   */
  async findAll(query: QuerySalesDto): Promise<Paginated<unknown>> {
    const { status, customerId } = query;
    const { skip, take, page, pageSize } = toSkipTake(query);
    const where: Prisma.SaleWhereInput = {
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: { customer: true, seller: true, items: true, payments: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return paginated(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        seller: true,
        warehouse: true,
        items: { include: { product: true } },
        payments: true,
        shippingAddress: true,
        invoice: { include: { corrections: { orderBy: { createdAt: 'asc' } } } },
        shipment: { include: { events: { orderBy: { createdAt: 'asc' } } } },
      },
    });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    return sale;
  }

  async create(sellerId: string | undefined, dto: CreateSaleDto, channel: SaleChannel = SaleChannel.STORE) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) throw new NotFoundException('Depósito não encontrado');

    let customer: { paymentTermDays: number | null } | null = null;
    if (dto.customerId) {
      customer = await this.prisma.customer.findUnique({
        where: { id: dto.customerId },
        select: { paymentTermDays: true },
      });
      if (!customer) throw new NotFoundException('Cliente não encontrado');
    }

    const productIds = dto.items.filter((i) => i.productId).map((i) => i.productId!);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const items: ResolvedSaleItem[] = dto.items.map((item) => {
      if (!item.productId) {
        if (!item.description || item.unitPrice === undefined) {
          throw new BadRequestException('Itens sem produto (ex.: mão de obra) precisam de description e unitPrice');
        }
        const discount = item.discount ?? 0;
        const total = Math.round((item.unitPrice * item.quantity - discount) * 100) / 100;
        return { description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, discount, total };
      }

      const product = productMap.get(item.productId);
      if (!product) throw new NotFoundException(`Produto ${item.productId} não encontrado`);

      const unitPrice = item.unitPrice ?? Number(product.price);
      const discount = item.discount ?? 0;
      const total = Math.round((unitPrice * item.quantity - discount) * 100) / 100;
      return { productId: item.productId, quantity: item.quantity, unitPrice, discount, total };
    });

    const subtotal = Math.round(items.reduce((sum, i) => sum + i.total, 0) * 100) / 100;

    let saleDiscount = dto.discount ?? 0;
    let shippingCost = dto.shippingCost ?? 0;
    let couponId: string | undefined;
    if (dto.couponCode) {
      const couponResult = await this.couponsService.validate(dto.couponCode, subtotal);
      saleDiscount = Math.round((saleDiscount + couponResult.discountAmount) * 100) / 100;
      couponId = couponResult.couponId;
      // Frete grátis do cupom é aplicado aqui, no servidor — nunca confia no
      // valor de shippingCost que o cliente mandou quando o cupom zera o frete.
      if (couponResult.freeShipping) shippingCost = 0;
    }

    const cardFeeAmount = dto.cardFeeAmount ?? 0;
    const total = Math.round((subtotal - saleDiscount + shippingCost + cardFeeAmount) * 100) / 100;

    if (dto.confirm) {
      // Fiado exige um cliente identificado (não dá pra cobrar "cliente
      // avulso" depois) e um prazo em dias — vindo da forma de pagamento
      // "Fiado" escolhida na hora da venda (fiadoDays) ou, na falta dele, do
      // prazo padrão configurado no cadastro do cliente. Sem nenhum dos
      // dois não dá pra saber quando cobrar, então não libera o desconto.
      const canFiado = !!dto.customerId && (!!dto.fiadoDays || !!customer?.paymentTermDays);
      this.assertPaymentsCoverTotal(dto.payments, total, canFiado);
    }

    // Vínculo com o caixa aberto do operador. Este é o caminho do PDV, que
    // cria e confirma numa chamada só — e é o caminho NORMAL de venda no
    // balcão. Sem isto, a venda existe e o caixa não a enxerga: o operador
    // fecha o dia com a gaveta cheia e o sistema dizendo que só tinha o
    // troco inicial, e passa a noite procurando uma diferença que não existe.
    //
    // Só faz sentido para venda de balcão: pedido da loja virtual não passa
    // pela gaveta de ninguém.
    const cashSessionId =
      dto.confirm && sellerId && channel === SaleChannel.STORE
        ? await this.cashService.findOpenSessionId(sellerId)
        : null;

    const sale = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          customerId: dto.customerId,
          sellerId,
          warehouseId: dto.warehouseId,
          channel,
          shippingAddressId: dto.shippingAddressId,
          couponId,
          status: dto.confirm ? SaleStatus.CONFIRMED : SaleStatus.QUOTE,
          subtotal,
          discount: saleDiscount,
          shippingCost,
          cardFeeAmount,
          total,
          notes: dto.notes,
          confirmedAt: dto.confirm ? new Date() : null,
          ...(cashSessionId ? { cashSessionId } : {}),
        } as Prisma.SaleUncheckedCreateInput,
      });

      if (couponId && dto.confirm) {
        await this.couponsService.incrementUsage(tx, couponId);
      }

      await tx.saleItem.createMany({
        data: items.map((item) => ({ ...item, saleId: sale.id })) as Prisma.SaleItemUncheckedCreateInput[],
      });

      if (dto.payments && dto.payments.length > 0) {
        await tx.salePayment.createMany({
          data: dto.payments.map((p) => ({
            method: p.method,
            installments: p.installments ?? 1,
            amount: p.amount,
            saleId: sale.id,
          })) as Prisma.SalePaymentUncheckedCreateInput[],
        });
      }

      if (dto.confirm) {
        await this.applyConfirmEffects(tx, sellerId, {
          id: sale.id,
          warehouseId: dto.warehouseId,
          customerId: dto.customerId,
          items,
          payments: dto.payments ?? [],
          total,
          paymentTermDays: customer?.paymentTermDays ?? null,
          fiadoDays: dto.fiadoDays,
        });
      }

      return tx.sale.findUniqueOrThrow({
        where: { id: sale.id },
        include: { items: true, payments: true },
      });
    });

    // Fora da transação de propósito: envio de WhatsApp não é atômico com a
    // venda e uma falha no provedor nunca pode reverter uma venda já criada.
    if (dto.confirm && channel === SaleChannel.ONLINE) {
      try {
        await this.automationsService.sendOrderConfirmation(sale.id);
      } catch (error) {
        this.logger.error('Falha ao enviar confirmação de pedido por WhatsApp', error as Error);
      }
    }

    if (dto.confirm) {
      await this.automationEngine.fireEvent('SALE_CONFIRMED', AutomationEntityType.SALE, sale.id);
    }

    return sale;
  }

  /**
   * Gera a venda automaticamente quando uma ordem de serviço é concluída
   * (ver ServiceOrdersService.updateStatus). A venda nasce CONFIRMADA — o
   * serviço já foi executado, as peças já saíram do estoque — mas sem
   * nenhum SalePayment: fica como um lançamento a receber PENDENTE no
   * Financeiro, para a equipe marcar como pago quando o cliente pagar.
   */
  async createFromServiceOrder(serviceOrder: {
    id: string;
    customerId: string;
    items: { productId: string | null; description: string; quantity: number; unitPrice: Prisma.Decimal | number }[];
  }) {
    const warehouse =
      (await this.prisma.warehouse.findFirst({ where: { isDefault: true } })) ??
      (await this.prisma.warehouse.findFirst());
    if (!warehouse) {
      throw new BadRequestException('Nenhum depósito cadastrado — não é possível gerar a venda da ordem de serviço');
    }

    const items: ResolvedSaleItem[] = serviceOrder.items.map((item) => {
      const unitPrice = Number(item.unitPrice);
      const total = Math.round(unitPrice * item.quantity * 100) / 100;
      return item.productId
        ? { productId: item.productId, quantity: item.quantity, unitPrice, discount: 0, total }
        : { description: item.description, quantity: item.quantity, unitPrice, discount: 0, total };
    });

    const subtotal = Math.round(items.reduce((sum, i) => sum + i.total, 0) * 100) / 100;

    const confirmedSale = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          customerId: serviceOrder.customerId,
          warehouseId: warehouse.id,
          channel: SaleChannel.STORE,
          status: SaleStatus.CONFIRMED,
          subtotal,
          total: subtotal,
          notes: `Gerada automaticamente ao concluir a ordem de serviço ${serviceOrder.id}`,
          confirmedAt: new Date(),
        } as Prisma.SaleUncheckedCreateInput,
      });

      await tx.saleItem.createMany({
        data: items.map((item) => ({ ...item, saleId: sale.id })) as Prisma.SaleItemUncheckedCreateInput[],
      });

      await this.applyConfirmEffects(tx, undefined, {
        id: sale.id,
        warehouseId: warehouse.id,
        customerId: serviceOrder.customerId,
        items,
        payments: [],
        total: subtotal,
      });

      // Cliente parceiro/fiado (Customer.paymentTermDays) adia o vencimento
      // em N dias em vez de vencer no dia da conclusão do serviço.
      const customer = await tx.customer.findUnique({
        where: { id: serviceOrder.customerId },
        select: { paymentTermDays: true },
      });
      const dueDate = new Date();
      if (customer?.paymentTermDays) {
        dueDate.setDate(dueDate.getDate() + customer.paymentTermDays);
      }

      await tx.financialEntry.create({
        data: {
          type: 'RECEIVABLE',
          description: `Ordem de serviço ${serviceOrder.id}`,
          category: 'Ordens de serviço',
          amount: subtotal,
          dueDate,
          status: 'PENDING',
          customerId: serviceOrder.customerId,
          saleId: sale.id,
        } as Prisma.FinancialEntryUncheckedCreateInput,
      });

      return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true, payments: true } });
    });

    await this.automationEngine.fireEvent('SALE_CONFIRMED', AutomationEntityType.SALE, confirmedSale.id);

    return confirmedSale;
  }

  /**
   * Confirma um orçamento (venda em status QUOTE, salvo no PDV). Aceita
   * pagamentos informados na hora da confirmação (tela de Vendas) além dos
   * que já estavam anexados à venda desde a criação — soma os dois. Qualquer
   * cliente identificado pode receber fiado no que não for coberto (ver
   * assertPaymentsCoverTotal).
   */
  async confirm(
    userId: string,
    saleId: string,
    newPayments?: SalePaymentDto[],
    fiadoDays?: number,
    cardFeeAmount?: number,
  ) {
    // Consultado fora da transação: é só leitura e não participa da
    // atomicidade da venda.
    const cashSessionId = await this.cashService.findOpenSessionId(userId);

    const confirmedSale = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true, payments: true } });
      if (!sale) throw new NotFoundException('Venda não encontrada');
      if (sale.status !== SaleStatus.QUOTE) {
        throw new BadRequestException('Somente orçamentos podem ser confirmados');
      }

      if (newPayments && newPayments.length > 0) {
        await tx.salePayment.createMany({
          data: newPayments.map((p) => ({
            saleId,
            method: p.method,
            installments: p.installments ?? 1,
            amount: p.amount,
          })) as Prisma.SalePaymentUncheckedCreateInput[],
        });
      }

      const customer = sale.customerId
        ? await tx.customer.findUnique({ where: { id: sale.customerId }, select: { paymentTermDays: true } })
        : null;

      const payments = [
        ...sale.payments.map((p) => ({ method: p.method, installments: p.installments, amount: Number(p.amount) })),
        ...(newPayments ?? []),
      ];
      const canFiado = !!sale.customerId && (!!fiadoDays || !!customer?.paymentTermDays);
      // Repasse de taxa de cartão escolhido na hora da confirmação soma ao
      // total fixado quando a venda ainda era orçamento (sem forma de
      // pagamento definida, logo sem taxa calculada ainda).
      const extraCardFee = cardFeeAmount ?? 0;
      const effectiveTotal = Math.round((Number(sale.total) + extraCardFee) * 100) / 100;
      this.assertPaymentsCoverTotal(payments, effectiveTotal, canFiado);

      await this.applyConfirmEffects(tx, userId, {
        id: sale.id,
        warehouseId: sale.warehouseId,
        customerId: sale.customerId ?? undefined,
        items: sale.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        payments,
        total: effectiveTotal,
        paymentTermDays: customer?.paymentTermDays ?? null,
        fiadoDays,
      });

      return tx.sale.update({
        where: { id: sale.id },
        data: {
          status: SaleStatus.CONFIRMED,
          confirmedAt: new Date(),
          // Amarra a venda ao caixa aberto do operador, quando houver. É o que
          // permite ao fechamento saber quais vendas entraram naquela gaveta.
          // Fica nulo quando ninguém abriu caixa, ou quando a venda não veio
          // do balcão (loja virtual, ordem de serviço) — nesses casos ela
          // simplesmente não entra na conferência de nenhum operador.
          ...(cashSessionId ? { cashSessionId } : {}),
          ...(extraCardFee > 0
            ? { cardFeeAmount: { increment: extraCardFee }, total: effectiveTotal }
            : {}),
        },
        include: { items: true, payments: true },
      });
    });

    // Fora da transação de negócio: uma falha ao disparar automações (ex.:
    // WhatsApp fora do ar) nunca pode desfazer uma venda já confirmada.
    await this.automationEngine.fireEvent('SALE_CONFIRMED', AutomationEntityType.SALE, confirmedSale.id);

    return confirmedSale;
  }

  /**
   * Registra o recebimento de uma venda já confirmada sem pagamento (ex.:
   * a venda gerada automaticamente ao concluir uma ordem de serviço, que
   * nasce com o lançamento financeiro PENDENTE e nenhum SalePayment). Ao
   * cobrir o saldo devedor, quita também o(s) lançamento(s) financeiros
   * ligados a essa venda — pra "dar baixa" acontecer num único lugar em
   * vez do financeiro e da venda ficarem com informação divergente.
   */
  async registerPayment(saleId: string, dto: SalePaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { payments: true } });
      if (!sale) throw new NotFoundException('Venda não encontrada');
      if (sale.status !== SaleStatus.CONFIRMED) {
        throw new BadRequestException('Só é possível registrar pagamento em vendas confirmadas');
      }

      const alreadyPaid = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const remaining = Math.round((Number(sale.total) - alreadyPaid) * 100) / 100;
      if (remaining <= 0) {
        throw new BadRequestException('Esta venda já está totalmente paga');
      }
      if (dto.amount > remaining + 0.01) {
        throw new BadRequestException(
          `O valor informado (R$ ${dto.amount.toFixed(2)}) é maior que o saldo pendente (R$ ${remaining.toFixed(2)})`,
        );
      }

      await tx.salePayment.create({
        data: {
          saleId,
          method: dto.method,
          installments: dto.installments ?? 1,
          amount: dto.amount,
        } as Prisma.SalePaymentUncheckedCreateInput,
      });

      if (Math.abs(remaining - dto.amount) < 0.01) {
        await tx.financialEntry.updateMany({
          where: { saleId, status: 'PENDING' },
          data: { status: 'PAID', paidAt: new Date() },
        });
      }

      return tx.sale.findUniqueOrThrow({
        where: { id: saleId },
        include: { items: true, payments: true },
      });
    });
  }

  async cancel(saleId: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    if (sale.status !== SaleStatus.QUOTE) {
      throw new BadRequestException('Somente orçamentos podem ser cancelados diretamente — vendas confirmadas usam devolução');
    }
    return this.prisma.sale.update({ where: { id: saleId }, data: { status: SaleStatus.CANCELED } });
  }

  async returnSale(userId: string, saleId: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true } });
      if (!sale) throw new NotFoundException('Venda não encontrada');
      if (sale.status !== SaleStatus.CONFIRMED) {
        throw new BadRequestException('Somente vendas confirmadas podem ser devolvidas');
      }

      for (const item of sale.items) {
        if (!item.productId) continue;
        // eslint-disable-next-line no-await-in-loop
        await this.stockService.performAdjust(tx, userId, {
          productId: item.productId,
          warehouseId: sale.warehouseId,
          type: 'IN',
          quantity: item.quantity,
          reason: `Devolução da venda ${sale.id}`,
        });
      }

      await tx.financialEntry.updateMany({
        where: { saleId: sale.id, status: 'PENDING' },
        data: { status: 'CANCELED' },
      });

      // Se a venda tem um envio associado, ele precisa refletir a devolução
      // também — senão fica um estado inconsistente (venda devolvida com o
      // envio ainda marcado como "entregue", por exemplo). Atômico com o
      // resto porque é parte da mesma operação de negócio, não um efeito
      // colateral opcional como a notificação por WhatsApp.
      await this.shipmentsService.returnShipmentIfExists(tx, sale.id, `Devolução da venda ${sale.id}`);

      return tx.sale.update({
        where: { id: saleId },
        data: { status: SaleStatus.RETURNED },
        include: { items: true, payments: true },
      });
    });
  }

  async commissionReport(from?: Date, to?: Date, sellerId?: string) {
    const sales = await this.prisma.sale.findMany({
      where: {
        status: SaleStatus.CONFIRMED,
        ...(sellerId ? { sellerId } : {}),
        ...(from || to
          ? { confirmedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      include: { seller: true },
    });

    const bySeller = new Map<
      string,
      { sellerId: string; sellerName: string; totalSales: number; commissionRate: number; commissionAmount: number }
    >();

    for (const sale of sales) {
      if (!sale.sellerId || !sale.seller) continue;
      const rate = Number(sale.seller.commissionRate ?? 0);
      const entry = bySeller.get(sale.sellerId) ?? {
        sellerId: sale.sellerId,
        sellerName: sale.seller.name,
        totalSales: 0,
        commissionRate: rate,
        commissionAmount: 0,
      };
      entry.totalSales = Math.round((entry.totalSales + Number(sale.total)) * 100) / 100;
      entry.commissionAmount = Math.round((entry.totalSales * rate) / 100 * 100) / 100;
      bySeller.set(sale.sellerId, entry);
    }

    return Array.from(bySeller.values());
  }

  /**
   * Para venda avulsa (sem cliente), os pagamentos precisam cobrir o total
   * exatamente. Quando há um cliente identificado (allowShortfall=true), a
   * forma de pagamento "Fiado" pode ser usada e aceita pagamento parcial ou
   * nenhum — o restante vira conta a receber (ver applyConfirmEffects),
   * nunca pode é passar do total.
   */
  private assertPaymentsCoverTotal(payments: SalePaymentDto[] | undefined, total: number, allowShortfall = false) {
    const paymentsTotal = Math.round((payments ?? []).reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
    if (allowShortfall) {
      if (paymentsTotal > total + 0.01) {
        throw new BadRequestException('A soma dos pagamentos não pode ser maior que o total da venda');
      }
      return;
    }
    if (!payments || payments.length === 0) {
      throw new BadRequestException('Informe ao menos uma forma de pagamento para confirmar a venda');
    }
    if (Math.abs(paymentsTotal - total) > 0.01) {
      throw new BadRequestException('A soma dos pagamentos deve ser igual ao total da venda');
    }
  }

  private async applyConfirmEffects(
    tx: PrismaTx,
    userId: string | undefined,
    sale: {
      id: string;
      warehouseId: string;
      customerId?: string;
      items: { productId?: string | null; quantity: number }[];
      payments: { method: string; installments?: number; amount: number }[];
      total: number;
      paymentTermDays?: number | null;
      fiadoDays?: number | null;
    },
  ) {
    // Itens sem produto (ex.: mão de obra vinda de uma ordem de serviço) não
    // têm estoque a baixar — só os itens de peça movimentam o depósito.
    for (const item of sale.items) {
      if (!item.productId) continue;
      // eslint-disable-next-line no-await-in-loop
      await this.stockService.performAdjust(tx, userId, {
        productId: item.productId,
        warehouseId: sale.warehouseId,
        type: 'OUT',
        quantity: item.quantity,
        reason: `Venda ${sale.id}`,
      });
    }

    for (const payment of sale.payments) {
      const installments = payment.installments ?? 1;
      const paidNow = installments === 1 && (payment.method === 'CASH' || payment.method === 'DEBIT_CARD');
      const baseInstallmentAmount = Math.round((payment.amount / installments) * 100) / 100;

      for (let i = 0; i < installments; i++) {
        const isLast = i === installments - 1;
        const amount = isLast
          ? Math.round((payment.amount - baseInstallmentAmount * (installments - 1)) * 100) / 100
          : baseInstallmentAmount;
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + i);

        // eslint-disable-next-line no-await-in-loop
        await tx.financialEntry.create({
          data: {
            type: 'RECEIVABLE',
            description: `Venda ${sale.id}${installments > 1 ? ` — parcela ${i + 1}/${installments}` : ''}`,
            category: 'Vendas',
            amount,
            dueDate,
            status: paidNow ? 'PAID' : 'PENDING',
            paidAt: paidNow ? new Date() : null,
            customerId: sale.customerId,
            saleId: sale.id,
          } as Prisma.FinancialEntryUncheckedCreateInput,
        });
      }
    }

    // Fiado: o que os pagamentos não cobriram vira uma conta a receber —
    // qualquer cliente identificado pode receber fiado (é a forma de
    // pagamento "Fiado" escolhida na tela). O prazo em dias vem do que foi
    // escolhido na hora da venda (fiadoDays) ou, na falta dele, do prazo
    // padrão configurado no cadastro do cliente.
    const paidTotal = Math.round(sale.payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
    const remaining = Math.round((sale.total - paidTotal) * 100) / 100;
    const fiadoTermDays = sale.fiadoDays ?? sale.paymentTermDays;
    if (remaining > 0.01 && sale.customerId && fiadoTermDays) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + fiadoTermDays);
      await tx.financialEntry.create({
        data: {
          type: 'RECEIVABLE',
          description: `Venda ${sale.id} — fiado`,
          category: 'Fiado',
          amount: remaining,
          dueDate,
          status: 'PENDING',
          customerId: sale.customerId,
          saleId: sale.id,
        } as Prisma.FinancialEntryUncheckedCreateInput,
      });
    }
  }
}
