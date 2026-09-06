import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConversationStatus, MessageDirection, MessageSender, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatbotService } from './chatbot.service';
import { WHATSAPP_PROVIDER, WhatsAppProvider } from './whatsapp-provider.interface';
import { InboundMessageDto } from './dto/inbound-message.dto';
import { QueryConversationsDto } from './dto/query-conversations.dto';
import { PaginationQueryDto, paginated, toSkipTake } from '../common/pagination/pagination.dto';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatbot: ChatbotService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  async list(query: QueryConversationsDto) {
    const { skip, take, page, pageSize } = toSkipTake(query);
    const busca = query.search?.trim();
    const onde: Prisma.ConversationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(busca
        ? {
            OR: [
              { phoneNumber: { contains: busca, mode: 'insensitive' } },
              { customer: { name: { contains: busca, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [conversas, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where: onde,
        // `customer: true` trazia a ficha inteira do cliente — endereço,
        // documento, limite de crédito, observações — para escrever o nome numa
        // linha de lista. Multiplicado por milhares de conversas, era a maior
        // parte do 1,5 MB que o Inbox baixava para abrir.
        select: {
          id: true,
          phoneNumber: true,
          status: true,
          lastMessageAt: true,
          createdAt: true,
          customer: { select: { id: true, name: true } },
          assignedUser: { select: { id: true, name: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, createdAt: true, sender: true },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.conversation.count({ where: onde }),
    ]);
    return paginated(conversas, total, page, pageSize);
  }

  /**
   * O cabeçalho da conversa, sem as mensagens.
   *
   * As mensagens saíram daqui porque uma conversa não tem tamanho: a do
   * cliente que compra há três anos tem centenas. Medido numa conversa de 400
   * mensagens, esta rota devolvia 157 KB — e devolvia isso de novo a cada
   * resposta que o atendente mandava, porque `reply` terminava aqui.
   */
  async findOne(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: true,
        assignedUser: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada');
    return conversation;
  }

  /**
   * As mensagens, da mais recente para a mais antiga.
   *
   * Desta ordem, e não da cronológica: quem abre uma conversa quer o fim dela.
   * A página 1 é o que aconteceu agora; "ver anteriores" é a página 2. A tela
   * inverte para exibir de cima para baixo.
   */
  async findMessages(id: string, query: PaginationQueryDto) {
    await this.requireConversation(id);
    const { skip, take, page, pageSize } = toSkipTake(query);
    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId: id },
        // Desempate por id: duas mensagens no mesmo segundo podem trocar de
        // lugar entre páginas, e numa conversa isso é mensagem sumindo.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.message.count({ where: { conversationId: id } }),
    ]);
    return paginated(messages, total, page, pageSize);
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

    // Recibo curto para o provedor. Antes devolvia a conversa inteira — o
    // BSP descarta o corpo, e mandar o histórico de volta para fora é
    // trabalho a mais para vazar o que ele não precisa ver.
    return { ok: true, conversationId: conversation.id };
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

  /**
   * Resposta manual de um atendente humano.
   *
   * Devolve A MENSAGEM enviada, não a conversa. Terminava em `findOne`, e numa
   * conversa de 400 mensagens isso eram 157 KB por resposta digitada — o
   * histórico inteiro trafegando de novo para acrescentar uma linha ao fim
   * dele. A tela só precisa da linha nova para colocar no lugar.
   */
  async reply(id: string, text: string) {
    const conversation = await this.requireConversation(id);
    return this.sendAndLog(conversation.id, conversation.phoneNumber, text, MessageSender.AGENT);
  }

  /** Envio de catálogo de produtos direto pelo WhatsApp. */
  async sendCatalog(id: string) {
    const conversation = await this.requireConversation(id);
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      take: 10,
    });
    const lines = products.map((p) => `• ${p.name} — R$ ${Number(p.price).toFixed(2)}`);
    const text = ['Confira nosso catálogo:', ...lines].join('\n');
    return this.sendAndLog(conversation.id, conversation.phoneNumber, text, MessageSender.AGENT);
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
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        direction: MessageDirection.OUTBOUND,
        sender,
        content: text,
        externalId: result.externalId,
      } as Prisma.MessageUncheckedCreateInput,
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    return message;
  }
}
