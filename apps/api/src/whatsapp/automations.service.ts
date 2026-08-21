import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AutomationType } from '@prisma/client';
import { JobLockService } from '../common/scheduling/job-lock.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { WhatsappSenderService } from './whatsapp-sender.service';
import { inicioDeHoje } from '../common/vencimento';

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
    private readonly sender: WhatsappSenderService,
    private readonly jobLock: JobLockService,
  ) {}

  /** Lembrete de cobrança para contas a receber vencidas ainda não avisadas. */
  async sendPaymentReminders() {
    const overdue = await this.prisma.financialEntry.findMany({
      // `inicioDeHoje` e não `new Date()`: quem vence hoje tem o dia inteiro
      // para pagar e não pode receber "identificamos uma pendência vencida em
      // {hoje}" hoje mesmo.
      where: { type: 'RECEIVABLE', status: 'PENDING', dueDate: { lt: inicioDeHoje() }, reminderSentAt: null },
      include: { customer: true },
    });

    for (const entry of overdue) {
      if (!entry.customer?.phone) continue;
      const text = `Olá ${entry.customer.name}, identificamos uma pendência em aberto: ${entry.description}, vencida em ${entry.dueDate.toLocaleDateString('pt-BR')}, no valor de R$ ${Number(entry.amount).toFixed(2)}. Qualquer dúvida, é só responder por aqui.`;
      // eslint-disable-next-line no-await-in-loop
      const enviou = await this.sendToCustomer(
        entry.customer.id,
        entry.customer.phone,
        text,
        AutomationType.PAYMENT_REMINDER,
      );

      // Só marca como avisado se a mensagem SAIU. Marcar sempre perderia o
      // lembrete de vez quando o teto da loja estivesse cheio: a conta
      // continuaria vencida e o cliente nunca seria avisado.
      if (!enviou) continue;
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

  private async sendToCustomer(
    customerId: string,
    phone: string,
    text: string,
    automationType: AutomationType,
  ): Promise<boolean> {
    // Passa pelo sender para respeitar o teto da loja e gravar a mensagem no
    // Inbox. Quando o teto estoura ele devolve false — aqui isso é só pular:
    // é um lote de lembretes, e derrubar o job por causa de um item deixaria
    // os seguintes sem nem tentar na próxima janela.
    return this.sender.enviarAutomatico({ phone, text, customerId, automationType });
  }
}
