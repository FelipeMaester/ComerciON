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
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      message: {
        create: jest.fn().mockResolvedValue({ id: 'msg-1', content: 'oi' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
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

  /**
   * O Inbox e a conversa cresciam sem teto.
   *
   * Medido numa loja com 2.000 conversas e 24 mil mensagens — um ano de uso:
   * abrir o Inbox baixava 1.492.064 bytes, e a conversa de um cliente antigo,
   * 157.553. Pior: `reply` terminava em `findOne`, então o histórico inteiro
   * voltava a cada resposta digitada pelo atendente.
   */
  describe('list', () => {
    it('pagina em vez de devolver o Inbox inteiro', async () => {
      prisma.conversation.findMany.mockResolvedValue([{ id: 'conv-1' }]);
      prisma.conversation.count.mockResolvedValue(2000);

      const pagina = await service.list({ page: 2, pageSize: 25 });

      expect(pagina).toEqual({ items: [{ id: 'conv-1' }], total: 2000, page: 2, pageSize: 25, totalPages: 80 });
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 25, take: 25 }));
    });

    it('traz do cliente só o que a lista mostra', async () => {
      await service.list({});
      const argumentos = prisma.conversation.findMany.mock.calls[0][0];
      // `customer: true` trazia endereço, documento, limite de crédito e
      // observações de cada cliente para escrever o nome numa linha.
      expect(argumentos.select.customer).toEqual({ select: { id: true, name: true } });
      expect(argumentos).not.toHaveProperty('include');
    });

    it('mantém o filtro por situação, que a tela já usava', async () => {
      await service.list({ status: 'PENDING' as never });
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) }),
      );
    });

    it('busca por telefone e por nome do cliente', async () => {
      await service.list({ search: ' Bela Vista ' });
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { phoneNumber: { contains: 'Bela Vista', mode: 'insensitive' } },
              { customer: { name: { contains: 'Bela Vista', mode: 'insensitive' } } },
            ],
          }),
        }),
      );
    });
  });

  describe('findOne e findMessages', () => {
    it('o cabeçalho não carrega as mensagens', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1' });
      await service.findOne('conv-1');
      const argumentos = prisma.conversation.findUnique.mock.calls[0][0];
      expect(argumentos.include).not.toHaveProperty('messages');
      expect(argumentos.include._count).toEqual({ select: { messages: true } });
    });

    it('as mensagens vêm da mais recente para a mais antiga, paginadas', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1' });
      prisma.message.findMany.mockResolvedValue([{ id: 'msg-9' }]);
      prisma.message.count.mockResolvedValue(400);

      const pagina = await service.findMessages('conv-1', { page: 1, pageSize: 50 });

      expect(pagina.total).toBe(400);
      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: 'conv-1' },
          // Desempate: duas mensagens no mesmo segundo trocando de lugar entre
          // páginas é mensagem sumindo da conversa.
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('rejeita conversa inexistente', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.findMessages('ghost', {})).rejects.toBeInstanceOf(NotFoundException);
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

    /**
     * O defeito: responder devolvia a conversa inteira. Numa thread de 400
     * mensagens eram 157 KB por resposta digitada — o histórico todo voltando
     * para acrescentar uma linha ao fim dele. Voltar o `return` para o
     * `findOne` faz este teste falhar.
     */
    it('a resposta devolve a mensagem enviada, não a conversa inteira', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', phoneNumber: '+5511999998888' });
      prisma.message.create.mockResolvedValue({ id: 'msg-1', content: 'Já verifico para você!' });

      const resposta = await service.reply('conv-1', 'Já verifico para você!');

      expect(resposta).toEqual({ id: 'msg-1', content: 'Já verifico para você!' });
      expect(resposta).not.toHaveProperty('messages');
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });
  });

  describe('webhook', () => {
    /**
     * O corpo da resposta do webhook vai para o provedor (Twilio, Zenvia), que
     * o descarta. Devolvia a conversa inteira: trabalho a mais para mandar
     * para fora um histórico que ninguém do outro lado lê.
     */
    it('responde ao provedor com um recibo curto', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1', status: 'OPEN', assignedUserId: 'user-1' });

      const resposta = await service.handleInboundWebhook({ from: '+5511999998888', text: 'Oi' });

      expect(resposta).toEqual({ ok: true, conversationId: 'conv-1' });
      expect(resposta).not.toHaveProperty('messages');
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
