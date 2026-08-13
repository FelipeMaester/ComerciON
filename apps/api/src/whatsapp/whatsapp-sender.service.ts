import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AutomationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from './whatsapp-provider.interface';

/**
 * Ponto único por onde passa todo envio AUTOMÁTICO de WhatsApp.
 *
 * Existe por dois motivos, e o segundo só apareceu ao escrever o primeiro:
 *
 * 1. Teto de gasto. Mensagem de WhatsApp por BSP é paga por unidade. Uma regra
 *    de automação com gatilho mal configurado envia sem ninguém no comando, e
 *    a primeira notícia disso costuma ser a fatura. Aqui existe um limite por
 *    loja, por janela de 24h.
 *
 * 2. Registro. O motor de automações mandava mensagem chamando o provider
 *    direto, sem gravar nada: a mensagem chegava ao cliente e não aparecia no
 *    Inbox. Se o cliente respondesse, o atendente via a resposta sem a
 *    pergunta. Passando por aqui, todo envio vira uma Message de verdade — o
 *    que também é o que torna o teto contável.
 *
 * O Inbox NÃO passa por aqui de propósito: lá tem uma pessoa digitando e
 * clicando em enviar, uma de cada vez. O risco que este teto cobre é o do
 * envio desacompanhado; bloquear a resposta de um atendente a um cliente real
 * seria trocar um problema de custo por um de atendimento.
 */
@Injectable()
export class WhatsappSenderService {
  private readonly logger = new Logger(WhatsappSenderService.name);
  private static readonly JANELA_HORAS = 24;
  private readonly limiteDiario: number;

  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const bruto = Number(config.get<string>('WHATSAPP_MAX_AUTOMATED_PER_DAY', '300'));
    // Valor inválido no .env cai no padrão em vez de virar NaN — com NaN toda
    // comparação dá falso e o teto simplesmente não existiria, silenciosamente.
    this.limiteDiario = Number.isFinite(bruto) && bruto >= 0 ? bruto : 300;
  }

  /** Quantas mensagens automáticas a loja ainda pode enviar nesta janela. */
  async saldoDaJanela(): Promise<{ enviadas: number; limite: number; restante: number }> {
    if (this.limiteDiario === 0) {
      return { enviadas: 0, limite: 0, restante: Number.POSITIVE_INFINITY };
    }

    const desde = new Date(Date.now() - WhatsappSenderService.JANELA_HORAS * 3_600_000);
    const enviadas = await this.prisma.message.count({
      where: { direction: 'OUTBOUND', sender: 'SYSTEM', createdAt: { gte: desde } },
    });

    return { enviadas, limite: this.limiteDiario, restante: Math.max(0, this.limiteDiario - enviadas) };
  }

  /**
   * Envia e registra. Devolve false — sem lançar — quando o teto foi atingido:
   * quem chama decide se isso é um erro a registrar ou um item a pular.
   */
  async enviarAutomatico(params: {
    phone: string;
    text: string;
    customerId?: string;
    automationType?: AutomationType;
  }): Promise<boolean> {
    const { restante } = await this.saldoDaJanela();
    if (restante <= 0) {
      this.logger.warn(
        `Teto de ${this.limiteDiario} mensagens automáticas em ${WhatsappSenderService.JANELA_HORAS}h atingido — envio para ${params.phone} não realizado.`,
      );
      return false;
    }

    let conversation = await this.prisma.conversation.findFirst({ where: { phoneNumber: params.phone } });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { phoneNumber: params.phone, customerId: params.customerId } as Prisma.ConversationUncheckedCreateInput,
      });
    }

    const result = await this.provider.sendText(params.phone, params.text);

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        sender: 'SYSTEM',
        content: params.text,
        automationType: params.automationType,
        externalId: result.externalId,
      } as Prisma.MessageUncheckedCreateInput,
    });
    await this.prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });

    return true;
  }
}
