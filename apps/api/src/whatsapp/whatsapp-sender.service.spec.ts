import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProvider } from './whatsapp-provider.interface';
import { WhatsappSenderService } from './whatsapp-sender.service';

describe('WhatsappSenderService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let provider: { sendText: jest.Mock };

  function criar(limite?: string) {
    const config = {
      get: jest.fn((_chave: string, padrao: string) => limite ?? padrao),
    } as unknown as ConfigService;
    return new WhatsappSenderService(provider as unknown as WhatsAppProvider, prisma as PrismaService, config);
  }

  beforeEach(() => {
    prisma = {
      message: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({}) },
      conversation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'conv-1' }),
        create: jest.fn().mockResolvedValue({ id: 'conv-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    provider = { sendText: jest.fn().mockResolvedValue({ externalId: 'ext-1' }) };
  });

  it('envia e registra a mensagem quando há saldo', async () => {
    const enviou = await criar('10').enviarAutomatico({ phone: '+5511999998888', text: 'Olá' });

    expect(enviou).toBe(true);
    expect(provider.sendText).toHaveBeenCalledWith('+5511999998888', 'Olá');
    // Registrar não é detalhe: é o que faz a mensagem aparecer no Inbox e o
    // que torna o próprio teto contável na janela seguinte.
    expect(prisma.message.create).toHaveBeenCalled();
  });

  it('não envia quando o teto da janela já foi atingido', async () => {
    prisma.message.count.mockResolvedValue(10);

    const enviou = await criar('10').enviarAutomatico({ phone: '+5511999998888', text: 'Olá' });

    expect(enviou).toBe(false);
    expect(provider.sendText).not.toHaveBeenCalled();
    // E não grava nada: uma mensagem registrada sem ter saído faria o
    // histórico do cliente mentir para o atendente.
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('conta só o que a própria loja mandou automaticamente na janela', async () => {
    await criar('10').enviarAutomatico({ phone: '+5511999998888', text: 'Olá' });

    const filtro = prisma.message.count.mock.calls[0][0].where;
    expect(filtro.direction).toBe('OUTBOUND');
    // SYSTEM exclui a resposta do atendente no Inbox, que não passa por aqui:
    // sem isso, um dia movimentado de atendimento humano derrubaria as
    // automações da loja.
    expect(filtro.sender).toBe('SYSTEM');
    expect(filtro.createdAt.gte).toBeInstanceOf(Date);
    // O tenant não aparece no filtro porque o middleware do Prisma o injeta.
  });

  it('limite 0 desliga o teto', async () => {
    prisma.message.count.mockResolvedValue(999_999);

    const enviou = await criar('0').enviarAutomatico({ phone: '+5511999998888', text: 'Olá' });

    expect(enviou).toBe(true);
    // Nem consulta o banco: desligado é desligado.
    expect(prisma.message.count).not.toHaveBeenCalled();
  });

  it('valor inválido no .env cai no padrão em vez de virar NaN', async () => {
    // Com NaN toda comparação dá falso e o teto deixaria de existir sem que
    // nada no log dissesse isso.
    prisma.message.count.mockResolvedValue(300);

    const enviou = await criar('trezentos').enviarAutomatico({ phone: '+5511999998888', text: 'Olá' });

    expect(enviou).toBe(false);
  });

  it('cria a conversa quando o cliente ainda não tem uma', async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);

    await criar('10').enviarAutomatico({ phone: '+5511977776666', text: 'Olá', customerId: 'cust-9' });

    expect(prisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phoneNumber: '+5511977776666', customerId: 'cust-9' }) }),
    );
  });
});
