import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, SaleChannel, SaleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../inventory/stock.service';
import { CouponsService } from '../coupons/coupons.service';
import { AutomationsService } from '../whatsapp/automations.service';
import { ShipmentsService } from '../logistics/shipments.service';
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
    private readonly shipmentsService: ShipmentsService,
  ) {}

  async findAll(status?: SaleStatus, customerId?: string) {
    return this.prisma.sale.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(customerId ? { customerId } : {}),
      },
      include: { customer: true, seller: true, items: true },
      orderBy: { createdAt: 'desc' },
    });
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

    if (dto.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
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

    const total = Math.round((subtotal - saleDiscount + shippingCost) * 100) / 100;

    if (dto.confirm) {
      this.assertPaymentsCoverTotal(dto.payments, total);
    }

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
          total,
          notes: dto.notes,
          confirmedAt: dto.confirm ? new Date() : null,
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

    return this.prisma.$transaction(async (tx) => {
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
  }

  async confirm(userId: string, saleId: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true, payments: true } });
      if (!sale) throw new NotFoundException('Venda não encontrada');
      if (sale.status !== SaleStatus.QUOTE) {
        throw new BadRequestException('Somente orçamentos podem ser confirmados');
      }

      const payments = sale.payments.map((p) => ({ method: p.method, installments: p.installments, amount: Number(p.amount) }));
      this.assertPaymentsCoverTotal(payments, Number(sale.total));

      await this.applyConfirmEffects(tx, userId, {
        id: sale.id,
        warehouseId: sale.warehouseId,
        customerId: sale.customerId ?? undefined,
        items: sale.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        payments,
      });

      return tx.sale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.CONFIRMED, confirmedAt: new Date() },
        include: { items: true, payments: true },
      });
    });
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

  private assertPaymentsCoverTotal(payments: SalePaymentDto[] | undefined, total: number) {
    if (!payments || payments.length === 0) {
      throw new BadRequestException('Informe ao menos uma forma de pagamento para confirmar a venda');
    }
    const paymentsTotal = Math.round(payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
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
  }
}
