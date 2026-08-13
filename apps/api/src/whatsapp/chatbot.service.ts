import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SALE_STATUS_LABEL: Record<string, string> = {
  QUOTE: 'orçamento em aberto',
  CONFIRMED: 'confirmado',
  CANCELED: 'cancelado',
  RETURNED: 'devolvido',
};

/**
 * Chatbot de primeiro atendimento: respostas simples baseadas em
 * palavras-chave para as perguntas mais comuns. Quando nenhuma regra
 * reconhece a mensagem, devolve null — a conversa fica com status PENDING
 * (ver ConversationsService) esperando um atendente humano assumir.
 */
@Injectable()
export class ChatbotService {
  constructor(private readonly prisma: PrismaService) {}

  async reply(customerId: string | null, text: string): Promise<string | null> {
    const normalized = text.toLowerCase();

    if (/pedido|status|rastre/.test(normalized)) {
      return this.replyOrderStatus(customerId);
    }
    if (/pagamento|pagar|pix|boleto|cart[aã]o/.test(normalized)) {
      return 'Aceitamos PIX, boleto, cartão de crédito, cartão de débito e dinheiro na entrega.';
    }
    if (/hor[aá]rio|funcionamento|aberto|atende/.test(normalized)) {
      return 'Atendemos de segunda a sexta, das 8h às 18h, e aos sábados das 8h às 12h.';
    }
    return null;
  }

  private async replyOrderStatus(customerId: string | null): Promise<string> {
    if (!customerId) {
      return 'Não encontrei um cadastro de cliente vinculado a este número. Um atendente vai te ajudar a localizar o pedido.';
    }

    const sale = await this.prisma.sale.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    if (!sale) {
      return 'Não encontrei nenhum pedido no seu cadastro. Um atendente vai te ajudar.';
    }

    const orderCode = sale.id.slice(0, 8);
    return `Seu último pedido (${orderCode}) está: ${SALE_STATUS_LABEL[sale.status]}.`;
  }
}
