import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConversationStatus, MessageDirection, MessageSender, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatbotService } from './chatbot.service';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from './whatsapp-provider.interface';
import { InboundMessageDto } from './dto/inbound-message.dto';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatbot: ChatbotService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  async list(status?: ConversationStatus) {
    return this.prisma.conversation.findMany({
      where: status ? { status } : {},
      include: { customer: true, assignedUser: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: true,
        assignedUser: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    return conversation;
  }

  /** Recebe uma mensagem do provedor (webhook) e aciona o chatbot de primeiro atendimento. */
  async handleInboundWebhook(dto: InboundMessageDto) {
    const customer = await this.prisma.customer.findFirst({ where: { phone: dto.from } });

    let conversation = await this.prisma.conversation.findFirst({ where: { phoneNumber: dto.from } });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          phoneNumber: dto.from,
          customerId: customer?.id,
        } as Prisma.ConversationUncheckedCreateInput,
      });
    } else if (conversation.status === ConversationStatus.CLOSED) {
      conversation = await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: ConversationStatus.OPEN },
      });
    }

    await this.logMessage(conversation.id, MessageDirection.INBOUND, MessageSender.CUSTOMER, dto.text);

    if (!conversation.assignedUserId) {
      const botReply = await this.chatbot.reply(conversation.customerId, dto.text);
      if (botReply) {
        await this.sendAndLog(conversation.id, dto.from, botReply, MessageSender.BOT);
      } else {
        await this.prisma.conversation.update({ where: { id: conversation.id }, data: { status: ConversationStatus.PENDING } });
      }
    }

    return this.findOne(conversation.id);
  }

  async assign(id: string, userId: string) {
    await this.requireConversation(id);
    return this.prisma.conversation.update({
      where: { id },
      data: { assignedUserId: userId, status: ConversationStatus.OPEN },
    });
  }

  async close(id: string) {
    await this.requireConversation(id);
    return this.prisma.conversation.update({ where: { id }, data: { status: ConversationStatus.CLOSED } });
  }

  /** Resposta manual de um atendente humano. */
  async reply(id: string, text: string) {
    const conversation = await this.requireConversation(id);
    await this.sendAndLog(conversation.id, conversation.phoneNumber, text, MessageSender.AGENT);
    return this.findOne(id);
  }

  /** Envio de catálogo de produtos direto pelo WhatsApp. */
  async sendCatalog(id: string) {
    const conversation = await this.requireConversation(id);
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      take: 10,
    });
    const lines = products.map((p) => `• ${p.name} — R$ ${Number(p.retailPrice).toFixed(2)}`);
    const text = ['Confira nosso catálogo:', ...lines].join('\n');
    await this.sendAndLog(conversation.id, conversation.phoneNumber, text, MessageSender.AGENT);
    return this.findOne(id);
  }

  private async requireConversation(id: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    return conversation;
  }

  private async logMessage(conversationId: string, direction: MessageDirection, sender: MessageSender, content: string) {
    await this.prisma.message.create({
      data: { conversationId, direction, sender, content } as Prisma.MessageUncheckedCreateInput,
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
  }

  private async sendAndLog(conversationId: string, to: string, text: string, sender: MessageSender) {
    const result = await this.provider.sendText(to, text);
    await this.prisma.message.create({
      data: {
        conversationId,
        direction: MessageDirection.OUTBOUND,
        sender,
        content: text,
        externalId: result.externalId,
      } as Prisma.MessageUncheckedCreateInput,
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
  }
}
