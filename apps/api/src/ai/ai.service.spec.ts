import { NotFoundException } from '@nestjs/common';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { LLMProvider } from './llm/llm-provider.interface';
import { AiToolsService } from './tools/ai-tools.service';

describe('AiService', () => {
  let service: AiService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let llm: { chat: jest.Mock };
  let tools: { getDefinitions: jest.Mock; execute: jest.Mock };

  beforeEach(() => {
    prisma = {
      aIConversation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      aIMessage: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    llm = { chat: jest.fn() };
    tools = { getDefinitions: jest.fn().mockReturnValue([{ name: 'getSalesSummary', description: '...', parameters: { type: 'object', properties: {} } }]), execute: jest.fn() };

    service = new AiService(
      llm as unknown as LLMProvider,
      tools as unknown as AiToolsService,
      prisma as unknown as PrismaService,
    );
  });

  describe('sendMessage', () => {
    it('cria uma conversa nova quando conversationId não é informado', async () => {
      prisma.aIConversation.create.mockResolvedValue({ id: 'conv-1', userId: 'user-1' });
      prisma.aIConversation.findUnique.mockResolvedValue({ id: 'conv-1', userId: 'user-1', messages: [] });
      llm.chat.mockResolvedValue({ assistantText: 'Vendemos R$ 100 hoje.', toolCalls: [] });

      await service.sendMessage('user-1', undefined, 'Quanto vendemos hoje?');

      expect(prisma.aIConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1' }) }),
      );
    });

    it('rejeita quando a conversa informada não existe ou não é do usuário', async () => {
      prisma.aIConversation.findUnique.mockResolvedValue(null);
      await expect(service.sendMessage('user-1', 'conv-outro', 'oi')).rejects.toBeInstanceOf(NotFoundException);

      prisma.aIConversation.findUnique.mockResolvedValue({ id: 'conv-2', userId: 'user-2' });
      await expect(service.sendMessage('user-1', 'conv-2', 'oi')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('responde direto quando o provider não pede nenhuma tool', async () => {
      prisma.aIConversation.findUnique.mockResolvedValueOnce({ id: 'conv-1', userId: 'user-1' }).mockResolvedValueOnce({
        id: 'conv-1',
        userId: 'user-1',
        messages: [{ role: 'ASSISTANT', content: 'Vendemos R$ 100 hoje.' }],
      });
      llm.chat.mockResolvedValue({ assistantText: 'Vendemos R$ 100 hoje.', toolCalls: [] });

      await service.sendMessage('user-1', 'conv-1', 'Quanto vendemos hoje?');

      expect(llm.chat).toHaveBeenCalledTimes(1);
      expect(tools.execute).not.toHaveBeenCalled();
      expect(prisma.aIMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'ASSISTANT', content: 'Vendemos R$ 100 hoje.' }) }),
      );
    });

    it('executa a tool pedida, devolve o resultado pro provider e retorna a resposta final', async () => {
      prisma.aIConversation.findUnique.mockResolvedValueOnce({ id: 'conv-1', userId: 'user-1' }).mockResolvedValueOnce({
        id: 'conv-1',
        userId: 'user-1',
        messages: [],
      });
      llm.chat
        .mockResolvedValueOnce({
          assistantText: null,
          toolCalls: [{ id: 'call-1', name: 'getSalesSummary', arguments: {} }],
        })
        .mockResolvedValueOnce({ assistantText: 'Vendemos R$ 100 hoje.', toolCalls: [] });
      tools.execute.mockResolvedValue({ today: { total: 100 } });

      await service.sendMessage('user-1', 'conv-1', 'Quanto vendemos hoje?');

      expect(tools.execute).toHaveBeenCalledWith('getSalesSummary', {});
      expect(llm.chat).toHaveBeenCalledTimes(2);
      // segunda chamada ao provider já inclui o resultado da tool no histórico
      const secondCallHistory = llm.chat.mock.calls[1][0];
      expect(secondCallHistory).toEqual(
        expect.arrayContaining([expect.objectContaining({ role: 'tool', toolCallId: 'call-1', toolName: 'getSalesSummary' })]),
      );
      expect(prisma.aIMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'TOOL', toolName: 'getSalesSummary' }) }),
      );
    });

    it('nunca deixa uma tool com erro travar a conversa — devolve o erro como resultado da tool', async () => {
      prisma.aIConversation.findUnique.mockResolvedValueOnce({ id: 'conv-1', userId: 'user-1' }).mockResolvedValueOnce({
        id: 'conv-1',
        userId: 'user-1',
        messages: [],
      });
      llm.chat
        .mockResolvedValueOnce({ assistantText: null, toolCalls: [{ id: 'call-1', name: 'getOpenQuotes', arguments: {} }] })
        .mockResolvedValueOnce({ assistantText: 'Não encontrei orçamentos abertos.', toolCalls: [] });
      tools.execute.mockRejectedValue(new Error('falha ao consultar'));

      await service.sendMessage('user-1', 'conv-1', 'Quais orçamentos estão abertos?');

      expect(llm.chat).toHaveBeenCalledTimes(2);
    });

    it('para depois do número máximo de rodadas de tool call, sem travar', async () => {
      prisma.aIConversation.findUnique.mockResolvedValueOnce({ id: 'conv-1', userId: 'user-1' }).mockResolvedValueOnce({
        id: 'conv-1',
        userId: 'user-1',
        messages: [],
      });
      llm.chat.mockResolvedValue({ assistantText: null, toolCalls: [{ id: 'call-x', name: 'getSalesSummary', arguments: {} }] });
      tools.execute.mockResolvedValue({});

      await service.sendMessage('user-1', 'conv-1', 'pergunta qualquer');

      expect(llm.chat).toHaveBeenCalledTimes(4);
      expect(prisma.aIMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'ASSISTANT' }) }),
      );
    });

    it('nunca passa tenantId nos argumentos da tool — só o que o modelo mandou', async () => {
      prisma.aIConversation.findUnique.mockResolvedValueOnce({ id: 'conv-1', userId: 'user-1' }).mockResolvedValueOnce({
        id: 'conv-1',
        userId: 'user-1',
        messages: [],
      });
      llm.chat
        .mockResolvedValueOnce({
          assistantText: null,
          toolCalls: [{ id: 'call-1', name: 'getCustomersWithoutRecentPurchase', arguments: { days: 90 } }],
        })
        .mockResolvedValueOnce({ assistantText: 'Ok.', toolCalls: [] });
      tools.execute.mockResolvedValue({ count: 0, customers: [] });

      await service.sendMessage('user-1', 'conv-1', 'Quais clientes sumiram?');

      expect(tools.execute).toHaveBeenCalledWith('getCustomersWithoutRecentPurchase', { days: 90 });
      expect(tools.execute.mock.calls[0][1]).not.toHaveProperty('tenantId');
    });
  });

  describe('getConversation', () => {
    it('rejeita quando a conversa não pertence ao usuário', async () => {
      prisma.aIConversation.findUnique.mockResolvedValue({ id: 'conv-1', userId: 'outro-user', messages: [] });
      await expect(service.getConversation('user-1', 'conv-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
