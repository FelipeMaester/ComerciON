import { NotFoundException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatbotService } from './chatbot.service';
import { WhatsAppProvider } from './whatsapp-provider.interface';

describe('ConversationsService', () => {
  let service: ConversationsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chatbot: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let provider: any;

  beforeEach(() => {
    prisma = {
      customer: { findFirst: jest.fn().mockResolvedValue(null) },
      conversation: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      message: { create: jest.fn().mockResolvedValue({}) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    chatbot = { reply: jest.fn().mockResolvedValue(null) };
    provider = { sendText: jest.fn().mockResolvedValue({ externalId: 'ext-1' }) };
    service = new ConversationsService(
      prisma as unknown as PrismaService,
      chatbot as unknown as ChatbotService,
      provider as unknown as WhatsAppProvider,
    );
  });

  describe('handleInboundWebhook', () => {
    it('cria uma conversa nova quando o telefone ainda não tem thread', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'conv-1', phoneNumber: '+5511999998888', assignedUserId: null });
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', messages: [] });

      await service.handleInboundWebhook({ from: '+5511999998888', text: 'Oi' });

      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ phoneNumber: '+5511999998888' }) }),
      );
    });

    it('reaproveita a conversa existente para o mesmo telefone', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', phoneNumber: '+5511999998888', status: 'OPEN', assignedUserId: null });
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', messages: [] });

      await service.handleInboundWebhook({ from: '+5511999998888', text: 'Oi de novo' });

      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('reabre uma conversa fechada quando o cliente manda mensagem de novo', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', phoneNumber: '+5511999998888', status: 'CLOSED', assignedUserId: null });
      prisma.conversation.update.mockResolvedValueOnce({ id: 'conv-1', phoneNumber: '+5511999998888', status: 'OPEN', assignedUserId: null });
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', messages: [] });

      await service.handleInboundWebhook({ from: '+5511999998888', text: 'Voltei' });

      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'conv-1' }, data: { status: 'OPEN' } }),
      );
    });

    it('responde automaticamente pelo bot quando a conversa não está atribuída a um atendente', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', phoneNumber: '+5511999998888', status: 'OPEN', assignedUserId: null });
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', messages: [] });
      chatbot.reply.mockResolvedValue('Atendemos de segunda a sexta.');

      await service.handleInboundWebhook({ from: '+5511999998888', text: 'Qual o horário?' });

      expect(provider.sendText).toHaveBeenCalledWith('+5511999998888', 'Atendemos de segunda a sexta.');
      expect(prisma.conversation.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PENDING' } }),
      );
    });

    it('marca a conversa como PENDING quando o bot não sabe responder', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', phoneNumber: '+5511999998888', status: 'OPEN', assignedUserId: null });
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', messages: [] });
      chatbot.reply.mockResolvedValue(null);

      await service.handleInboundWebhook({ from: '+5511999998888', text: 'Vocês vendem farol de milha?' });

      expect(provider.sendText).not.toHaveBeenCalled();
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'conv-1' }, data: { status: 'PENDING' } }),
      );
    });

    it('não aciona o bot quando a conversa já está atribuída a um atendente humano', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', phoneNumber: '+5511999998888', status: 'OPEN', assignedUserId: 'user-1' });
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', messages: [] });

      await service.handleInboundWebhook({ from: '+5511999998888', text: 'Oi' });

      expect(chatbot.reply).not.toHaveBeenCalled();
      expect(provider.sendText).not.toHaveBeenCalled();
    });
  });

  describe('assign/close/reply', () => {
    it('lança NotFoundException ao tentar operar em conversa inexistente', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.assign('ghost', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('atribui a conversa a um atendente e reabre se estava pendente', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1' });
      await service.assign('conv-1', 'user-1');
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'conv-1' }, data: { assignedUserId: 'user-1', status: 'OPEN' } }),
      );
    });

    it('envia a resposta manual do atendente via provider e registra a mensagem', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', phoneNumber: '+5511999998888' });
      await service.reply('conv-1', 'Já verifico para você!');
      expect(provider.sendText).toHaveBeenCalledWith('+5511999998888', 'Já verifico para você!');
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sender: 'AGENT', content: 'Já verifico para você!' }) }),
      );
    });
  });

  describe('sendCatalog', () => {
    it('monta a lista de produtos ativos e envia como mensagem', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', phoneNumber: '+5511999998888' });
      prisma.product.findMany.mockResolvedValue([{ name: 'Radiador Gol', price: 250 }]);

      await service.sendCatalog('conv-1');

      expect(provider.sendText).toHaveBeenCalledWith('+5511999998888', expect.stringContaining('Radiador Gol'));
    });
  });
});
