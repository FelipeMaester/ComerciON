import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Category, Prisma, Product, SaleChannel, StockItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { CouponsService } from '../coupons/coupons.service';
import { FreightService } from '../logistics/freight.service';
import { CreateCustomerAddressDto } from '../customers/dto/create-customer-address.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateCustomerProfileDto } from './dto/update-profile.dto';
import { CartSyncItemDto } from './dto/sync-cart.dto';

type PublicProduct = Omit<Product, 'costPrice'> & { inStock: boolean };

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesService: SalesService,
    private readonly couponsService: CouponsService,
    private readonly freightService: FreightService,
  ) {}

  /** Estimativa exibida na tela de checkout antes de confirmar o pedido. */
  async previewFreight(items: { productId: string; quantity: number }[], destinationState: string) {
    return this.freightService.estimateForItems(items, destinationState);
  }

  /**
   * Usado pela tela de checkout para saber o desconto ANTES de enviar o
   * pedido — sem isso, o valor do pagamento calculado no cliente (sem saber
   * o desconto) nunca bateria com o total que o servidor calcula ao
   * confirmar a venda, e o checkout falharia sempre que houvesse cupom.
   */
  async previewCoupon(code: string, subtotal: number) {
    return this.couponsService.validate(code, subtotal);
  }

  async listProducts(search?: string, categoryId?: string) {
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { brand: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      include: { category: true, stockItems: true },
      orderBy: { name: 'asc' },
    });
    return products.map((p) => this.toPublicProduct(p));
  }

  async listCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, stockItems: true },
    });
    if (!product || !product.isActive) throw new NotFoundException('Produto não encontrado');

    const reviews = await this.prisma.productReview.findMany({ where: { productId: id } });
    const averageRating = reviews.length
      ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
      : null;

    return { ...this.toPublicProduct(product), reviewsCount: reviews.length, averageRating };
  }

  async listReviews(productId: string) {
    return this.prisma.productReview.findMany({
      where: { productId },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOrUpdateReview(customerId: string, productId: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Produto não encontrado');

    return this.prisma.productReview.upsert({
      where: { productId_customerId: { productId, customerId } },
      create: {
        productId,
        customerId,
        rating: dto.rating,
        comment: dto.comment,
      } as Prisma.ProductReviewUncheckedCreateInput,
      update: { rating: dto.rating, comment: dto.comment },
    });
  }

  async listMyOrders(customerId: string) {
    return this.prisma.sale.findMany({
      where: { customerId },
      include: { items: { include: { product: true } }, payments: true, shipment: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyOrder(customerId: string, saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: { include: { product: true } },
        payments: true,
        shippingAddress: true,
        shipment: { include: { events: { orderBy: { createdAt: 'asc' } } } },
        invoice: true,
      },
    });
    if (!sale || sale.customerId !== customerId) throw new NotFoundException('Pedido não encontrado');
    return sale;
  }

  async listMyAddresses(customerId: string) {
    return this.prisma.customerAddress.findMany({ where: { customerId }, orderBy: { createdAt: 'asc' } });
  }

  async addAddress(customerId: string, dto: CreateCustomerAddressDto) {
    if (dto.isDefault) {
      await this.prisma.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    return this.prisma.customerAddress.create({
      data: { ...dto, customerId } as Prisma.CustomerAddressUncheckedCreateInput,
    });
  }

  async updateProfile(customerId: string, dto: UpdateCustomerProfileDto) {
    return this.prisma.customer.update({ where: { id: customerId }, data: dto });
  }

  /**
   * Cópia mínima do carrinho (que vive no localStorage do navegador) usada
   * só pela automação de recuperação de carrinho abandonado (Fase 5) — ver
   * AutomationsService.sendAbandonedCartReminders.
   */
  async syncCart(customerId: string, items: CartSyncItemDto[]) {
    if (items.length === 0) {
      await this.prisma.cartSnapshot.deleteMany({ where: { customerId } });
      return;
    }
    await this.prisma.cartSnapshot.upsert({
      where: { customerId },
      create: { customerId, itemsJson: items as unknown as Prisma.InputJsonValue } as Prisma.CartSnapshotUncheckedCreateInput,
      update: { itemsJson: items as unknown as Prisma.InputJsonValue, reminderSentAt: null, convertedAt: null },
    });
  }

  async checkout(customerId: string, dto: CheckoutDto) {
    const warehouse = await this.prisma.warehouse.findFirst({ where: { isDefault: true } });
    if (!warehouse) throw new BadRequestException('Esta loja ainda não tem um depósito configurado');

    const address = await this.prisma.customerAddress.findUnique({ where: { id: dto.shippingAddressId } });
    if (!address || address.customerId !== customerId) {
      throw new NotFoundException('Endereço de entrega não encontrado');
    }

    // Frete calculado aqui, no servidor, a partir do endereço já validado —
    // pela mesma razão que preço/desconto não vêm do cliente: se aceitássemos
    // um shippingCost enviado pelo cliente, ele poderia simplesmente mandar 0.
    const freight = await this.freightService.estimateForItems(dto.items, address.state);

    // Itens chegam só com productId/quantity (ver CheckoutItemDto) — preço
    // e desconto são sempre resolvidos no SalesService a partir do catálogo
    // e do cupom, nunca aceitos do cliente.
    const sale = await this.salesService.create(
      undefined,
      {
        customerId,
        warehouseId: warehouse.id,
        items: dto.items,
        payments: dto.payments,
        shippingAddressId: dto.shippingAddressId,
        couponCode: dto.couponCode,
        shippingCost: freight.cost,
        confirm: true,
      },
      SaleChannel.ONLINE,
    );

    // Marca o carrinho como convertido para a automação de carrinho
    // abandonado nunca mandar lembrete de um pedido que já foi concluído.
    await this.prisma.cartSnapshot.updateMany({ where: { customerId }, data: { convertedAt: new Date() } });

    return sale;
  }

  private toPublicProduct(product: Product & { category?: Category | null; stockItems?: StockItem[] }): PublicProduct {
    const { costPrice, stockItems, ...rest } = product;
    const totalQuantity = stockItems?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
    return { ...rest, inStock: totalQuantity > 0 };
  }
}
