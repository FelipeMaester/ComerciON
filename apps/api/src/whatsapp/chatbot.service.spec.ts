import { ChatbotService } from './chatbot.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ChatbotService', () => {
  let service: ChatbotService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(() => {
    prisma = { sale: { findFirst: jest.fn() } };
    service = new ChatbotService(prisma as unknown as PrismaService);
  });

  it('responde sobre formas de pagamento', async () => {
    const reply = await service.reply(null, 'Quais formas de pagamento vocês aceitam?');
    expect(reply).toMatch(/PIX/);
  });

  it('responde sobre horário de funcionamento', async () => {
    const reply = await service.reply(null, 'Qual o horário de vocês?');
    expect(reply).toMatch(/segunda a sexta/);
  });

  it('devolve null (precisa de atendente humano) para mensagem não reconhecida', async () => {
    const reply = await service.reply('cust-1', 'Vocês vendem farol de milha?');
    expect(reply).toBeNull();
  });

  describe('status de pedido', () => {
    it('pede para falar com atendente quando a conversa não está vinculada a um cliente', async () => {
      const reply = await service.reply(null, 'Qual o status do meu pedido?');
      expect(reply).toMatch(/atendente/);
      expect(prisma.sale.findFirst).not.toHaveBeenCalled();
    });

    it('avisa quando o cliente não tem nenhum pedido', async () => {
      prisma.sale.findFirst.mockResolvedValue(null);
      const reply = await service.reply('cust-1', 'Cadê meu pedido?');
      expect(reply).toMatch(/atendente/);
    });

    it('responde com o status de envio quando o pedido já tem envio', async () => {
      prisma.sale.findFirst.mockResolvedValue({
        id: 'sale-12345678',
        status: 'CONFIRMED',
        shipment: { status: 'SHIPPED' },
      });
      const reply = await service.reply('cust-1', 'Qual o status do meu pedido?');
      expect(reply).toMatch(/enviado/);
      expect(reply).toContain('sale-123');
    });

    it('responde com o status da venda quando ainda não tem envio', async () => {
      prisma.sale.findFirst.mockResolvedValue({ id: 'sale-12345678', status: 'CONFIRMED', shipment: null });
      const reply = await service.reply('cust-1', 'status do pedido');
      expect(reply).toMatch(/confirmado/);
    });
  });
});
