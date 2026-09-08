import { FilaDeEnvioService, MAXIMO_POR_RODADA } from './fila-de-envio.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PosseDaSessaoService } from './posse-da-sessao.service';
import type { EnviadorDeSessao } from './enviador-de-sessao';

/**
 * A fila que permite réplicas da API.
 *
 * O socket do WhatsApp de cada loja mora em UMA instância — o WhatsApp
 * derruba a segunda conexão da mesma conta. A requisição que pede o envio cai
 * em qualquer instância: quando não é a dona, ela grava a mensagem como
 * QUEUED e quem tem o socket a envia daqui.
 */
describe('FilaDeEnvioService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let posse: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sessoes: any;
  let fila: FilaDeEnvioService;

  const mensagem = (id: string, tenantId = 'loja-1') => ({
    id,
    tenantId,
    content: `texto de ${id}`,
    conversation: { phoneNumber: '5511999998888' },
  });

  beforeEach(() => {
    prisma = {
      runAsSystem: jest.fn(async (fn: () => unknown) => fn()),
      message: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    posse = { minhasLojas: jest.fn().mockResolvedValue(['loja-1']) };
    sessoes = { enviar: jest.fn().mockResolvedValue({ externalId: 'ext-1' }) };
    fila = new FilaDeEnvioService(
      prisma as unknown as PrismaService,
      posse as unknown as PosseDaSessaoService,
      sessoes as unknown as EnviadorDeSessao,
    );
  });

  it('sem loja nenhuma minha, não consulta a fila', async () => {
    posse.minhasLojas.mockResolvedValue([]);

    expect(await fila.rodada()).toEqual({ enviadas: 0, falhas: 0 });
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  /**
   * A asserção que impede o defeito de voltar: mandar mensagem de uma loja
   * que é de outra instância abriria um socket concorrente.
   */
  it('só olha a fila das lojas que esta instância possui', async () => {
    posse.minhasLojas.mockResolvedValue(['loja-1', 'loja-3']);

    await fila.rodada();

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: { in: ['loja-1', 'loja-3'] },
          status: 'QUEUED',
          direction: 'OUTBOUND',
        }),
      }),
    );
  });

  it('envia e marca como enviada, com o id que o WhatsApp devolveu', async () => {
    prisma.message.findMany.mockResolvedValue([mensagem('msg-1')]);

    expect(await fila.rodada()).toEqual({ enviadas: 1, falhas: 0 });

    expect(sessoes.enviar).toHaveBeenCalledWith('loja-1', '5511999998888', 'texto de msg-1');
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { status: 'SENT', externalId: 'ext-1' },
    });
  });

  /**
   * A causa mais comum de falha é o WhatsApp da loja desconectado, e isso se
   * resolve sozinho quando alguém reconecta. Marcar como falha aqui perderia
   * a mensagem sem ninguém pedir.
   */
  it('falha de envio deixa a mensagem na fila, sem marcar nada', async () => {
    prisma.message.findMany.mockResolvedValue([mensagem('msg-1')]);
    sessoes.enviar.mockRejectedValue(new Error('WhatsApp não conectado'));

    expect(await fila.rodada()).toEqual({ enviadas: 0, falhas: 1 });
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('uma mensagem com problema não impede as outras de sair', async () => {
    prisma.message.findMany.mockResolvedValue([mensagem('ruim'), mensagem('boa')]);
    sessoes.enviar.mockRejectedValueOnce(new Error('falhou')).mockResolvedValue({ externalId: 'ext-2' });

    expect(await fila.rodada()).toEqual({ enviadas: 1, falhas: 1 });
  });

  /**
   * Ordem de chegada: uma conversa é uma sequência, e mensagem fora de ordem
   * no WhatsApp do cliente é pior que mensagem atrasada.
   */
  it('sai na ordem em que entrou', async () => {
    await fila.rodada();
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
    );
  });

  /**
   * Uma fila acumulada (a instância dona caiu por uma hora) não pode virar
   * rajada: o WhatsApp trata isso como robô e derruba a conta da loja.
   */
  it('tem teto por rodada, para não virar rajada', async () => {
    await fila.rodada();
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: MAXIMO_POR_RODADA }),
    );
  });

  it('duas rodadas ao mesmo tempo não mandam a mesma mensagem duas vezes', async () => {
    prisma.message.findMany.mockResolvedValue([mensagem('msg-1')]);

    const [primeira, segunda] = await Promise.all([fila.rodada(), fila.rodada()]);

    // A segunda encontra a primeira em andamento e sai sem fazer nada.
    expect([primeira.enviadas, segunda.enviadas].sort()).toEqual([0, 1]);
    expect(sessoes.enviar).toHaveBeenCalledTimes(1);
  });
});
