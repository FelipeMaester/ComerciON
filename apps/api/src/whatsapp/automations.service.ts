import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AutomationType, Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from './whatsapp-provider.interface';

const ABANDONED_CART_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2h sem atualizar o carrinho

/**
 * Mensagens automáticas disparadas por eventos de negócio (confirmação de
 * pedido, aviso de envio) ou por jobs agendados (cobrança, carrinho
 * abandonado). Toda mensagem enviada aqui também fica registrada na
 * conversa do cliente, para aparecer no histórico do CRM (módulo 10 do
 * escopo original).
 */
@Injectable()
export class AutomationsService {
  private readonly logger = new Logger('AutomationsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  async sendOrderConfirmation(saleId: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId }, include: { customer: true } });
    if (!sale?.customer?.phone) return;

    const text = `Recebemos seu pedido ${sale.id.slice(0, 8)}! Total: R$ ${Number(sale.total).toFixed(2)}. Assim que despacharmos, avisamos por aqui.`;
    await this.sendToCustomer(sale.customer.id, sale.customer.phone, text, AutomationType.ORDER_CONFIRMATION);
  }

  async sendShippingUpdate(saleId: string, status: ShipmentStatus) {
    if (status !== ShipmentStatus.SHIPPED && status !== ShipmentStatus.DELIVERED) return;

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { customer: true, shipment: true },
    });
    if (!sale?.customer?.phone) return;

    const verb = status === ShipmentStatus.SHIPPED ? 'foi enviado' : 'foi entregue';
    const tracking = sale.shipment?.trackingCode ? ` Código de rastreio: ${sale.shipment.trackingCode}.` : '';
    const text = `Seu pedido ${sale.id.slice(0, 8)} ${verb}!${tracking}`;
    await this.sendToCustomer(sale.customer.id, sale.customer.phone, text, AutomationType.SHIPPING_UPDATE);
  }

  /** Lembrete de cobrança para contas a receber vencidas ainda não avisadas. */
  async sendPaymentReminders() {
    const overdue = await this.prisma.financialEntry.findMany({
      where: { type: 'RECEIVABLE', status: 'PENDING', dueDate: { lt: new Date() }, reminderSentAt: null },
      include: { customer: true },
    });

    for (const entry of overdue) {
      if (!entry.customer?.phone) continue;
      const text = `Olá ${entry.customer.name}, identificamos uma pendência em aberto: ${entry.description}, vencida em ${entry.dueDate.toLocaleDateString('pt-BR')}, no valor de R$ ${Number(entry.amount).toFixed(2)}. Qualquer dúvida, é só responder por aqui.`;
      // eslint-disable-next-line no-await-in-loop
      await this.sendToCustomer(entry.customer.id, entry.customer.phone, text, AutomationType.PAYMENT_REMINDER);
      // eslint-disable-next-line no-await-in-loop
      await this.prisma.financialEntry.update({ where: { id: entry.id }, data: { reminderSentAt: new Date() } });
    }
  }

  /** Recuperação de carrinho abandonado (nenhuma atualização há mais de 2h e ainda não convertido em pedido). */
  async sendAbandonedCartReminders() {
    const threshold = new Date(Date.now() - ABANDONED_CART_THRESHOLD_MS);
    const abandoned = await this.prisma.cartSnapshot.findMany({
      where: { reminderSentAt: null, convertedAt: null, updatedAt: { lt: threshold } },
      include: { customer: true },
    });

    for (const snapshot of abandoned) {
      if (!snapshot.customer?.phone) continue;
      const items = snapshot.itemsJson as unknown as { name: string; quantity: number }[];
      const itemsText = items.map((i) => `${i.quantity}x ${i.name}`).join(', ');
      const text = `Olá ${snapshot.customer.name}, você deixou itens no carrinho: ${itemsText}. Finalize sua compra antes que o estoque acabe!`;
      // eslint-disable-next-line no-await-in-loop
      await this.sendToCustomer(snapshot.customer.id, snapshot.customer.phone, text, AutomationType.ABANDONED_CART);
      // eslint-disable-next-line no-await-in-loop
      await this.prisma.cartSnapshot.update({ where: { id: snapshot.id }, data: { reminderSentAt: new Date() } });
    }
  }

  /**
   * Jobs agendados rodam fora do ciclo de requisição HTTP, então não existe
   * contexto de tenant automático (ver TenantContextInterceptor). Iteramos
   * todos os tenants e entramos manualmente no contexto de cada um por vez,
   * para que o middleware de tenant-scoping do Prisma funcione normalmente.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDailyAutomations() {
    const tenants = await this.prisma.runAsSystem(() => this.prisma.tenant.findMany({ select: { id: true } }));

    for (const tenant of tenants) {
      // eslint-disable-next-line no-await-in-loop
      await this.tenantContext.run({ tenantId: tenant.id }, async () => {
        try {
          await this.sendPaymentReminders();
          await this.sendAbandonedCartReminders();
        } catch (error) {
          this.logger.error(`Falha nas automações diárias do tenant ${tenant.id}`, error as Error);
        }
      });
    }
  }

  private async sendToCustomer(customerId: string, phone: string, text: string, automationType: AutomationType) {
    let conversation = await this.prisma.conversation.findFirst({ where: { phoneNumber: phone } });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { phoneNumber: phone, customerId } as Prisma.ConversationUncheckedCreateInput,
      });
    }

    const result = await this.provider.sendText(phone, text);
    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        sender: 'SYSTEM',
        content: text,
        automationType,
        externalId: result.externalId,
      } as Prisma.MessageUncheckedCreateInput,
    });
    await this.prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
  }
}
