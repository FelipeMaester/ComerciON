import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AutomationType, Prisma } from '@prisma/client';
import { JobLockService } from '../common/scheduling/job-lock.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from './whatsapp-provider.interface';

/**
 * Mensagens automáticas por job agendado. Toda mensagem enviada aqui também
 * fica registrada na conversa do cliente, para aparecer no histórico do CRM.
 *
 * Já teve confirmação de pedido, aviso de envio e recuperação de carrinho
 * abandonado — os três saíram junto com a loja virtual.
 */
@Injectable()
export class AutomationsService {
  private readonly logger = new Logger('AutomationsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    private readonly jobLock: JobLockService,
  ) {}

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

  /**
   * Jobs agendados rodam fora do ciclo de requisição HTTP, então não existe
   * contexto de tenant automático (ver TenantContextInterceptor). Iteramos
   * todos os tenants e entramos manualmente no contexto de cada um por vez,
   * para que o middleware de tenant-scoping do Prisma funcione normalmente.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDailyAutomations() {
    // Sob lock: sem isso, duas instâncias mandam a mesma cobrança e o mesmo
    // lembrete de carrinho para o cliente, e cada envio é cobrado.
    await this.jobLock.runExclusively('whatsapp:daily-automations', async () => {
      const tenants = await this.prisma.runAsSystem(() => this.prisma.tenant.findMany({ select: { id: true } }));

      for (const tenant of tenants) {
        // eslint-disable-next-line no-await-in-loop
        await this.tenantContext.run({ tenantId: tenant.id }, async () => {
          try {
            await this.sendPaymentReminders();
          } catch (error) {
            this.logger.error(`Falha nas automações diárias do tenant ${tenant.id}`, error as Error);
          }
        });
      }
    });
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
