import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationsService } from '../whatsapp/automations.service';

// Ordem de progressão normal de um envio. RETURNED é alcançável a partir de
// qualquer estado ativo (inclusive depois de DELIVERED) e é terminal.
const PROGRESSION: ShipmentStatus[] = ['PENDING', 'PROCESSING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'];

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger('ShipmentsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly automationsService: AutomationsService,
  ) {}

  async findBySale(saleId: string) {
    return this.prisma.shipment.findUnique({
      where: { saleId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async create(saleId: string, carrier?: string, trackingCode?: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId }, include: { shipment: true } });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    if (sale.status !== 'CONFIRMED') {
      throw new BadRequestException('Só é possível criar envio para vendas confirmadas');
    }
    if (sale.shipment) {
      throw new BadRequestException('Esta venda já tem um envio registrado');
    }

    return this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: { saleId, carrier, trackingCode, status: ShipmentStatus.PROCESSING } as Prisma.ShipmentUncheckedCreateInput,
      });
      await tx.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          status: ShipmentStatus.PROCESSING,
          note: 'Envio criado',
        } as Prisma.ShipmentEventUncheckedCreateInput,
      });
      return shipment;
    });
  }

  async updateStatus(saleId: string, status: ShipmentStatus, note?: string) {
    const shipment = await this.requireBySale(saleId);
    this.assertValidTransition(shipment.status, status);

    const shouldSetShippedAt =
      !shipment.shippedAt && (status === ShipmentStatus.SHIPPED || status === ShipmentStatus.IN_TRANSIT || status === ShipmentStatus.DELIVERED);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipment.update({
        where: { saleId },
        data: {
          status,
          shippedAt: shouldSetShippedAt ? new Date() : undefined,
          deliveredAt: status === ShipmentStatus.DELIVERED ? new Date() : undefined,
        },
      });
      await tx.shipmentEvent.create({
        data: { shipmentId: shipment.id, status, note } as Prisma.ShipmentEventUncheckedCreateInput,
      });
      return updated;
    });

    // Fora da transação de propósito, mesma razão do SalesService: envio de
    // WhatsApp não pode reverter uma atualização de status já persistida.
    try {
      await this.automationsService.sendShippingUpdate(saleId, status);
    } catch (error) {
      this.logger.error('Falha ao enviar aviso de rastreio por WhatsApp', error as Error);
    }

    return updated;
  }

  /** Romaneio: pedidos online confirmados que ainda não têm envio criado. */
  async dispatchList() {
    return this.prisma.sale.findMany({
      where: { status: 'CONFIRMED', channel: 'ONLINE', shipment: null },
      include: { customer: true, items: { include: { product: true } }, shippingAddress: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async requireBySale(saleId: string) {
    const shipment = await this.prisma.shipment.findUnique({ where: { saleId } });
    if (!shipment) throw new NotFoundException('Envio não encontrado para esta venda');
    return shipment;
  }

  private assertValidTransition(current: ShipmentStatus, next: ShipmentStatus) {
    if (current === ShipmentStatus.RETURNED) {
      throw new BadRequestException('Este envio já foi devolvido — não é possível alterar o status');
    }
    if (current === ShipmentStatus.DELIVERED && next !== ShipmentStatus.RETURNED) {
      throw new BadRequestException('Envio já entregue só pode mudar para "devolvido"');
    }
    if (next === ShipmentStatus.RETURNED) return;

    const currentIndex = PROGRESSION.indexOf(current);
    const nextIndex = PROGRESSION.indexOf(next);
    if (nextIndex <= currentIndex) {
      throw new BadRequestException(`Não é possível mover o envio de ${current} para ${next} — o status só avança`);
    }
  }
}
