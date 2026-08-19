import { DisconnectReason } from '@whiskeysockets/baileys';
import { SessaoWhatsappService } from './sessao-whatsapp.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Cada socket criado guarda seus ouvintes, para o teste poder simular a queda
 * da conexão como o Baileys faria.
 */
const sockets: { ouvintes: Record<string, (evento: unknown) => void> }[] = [];

/**
 * O Baileys é ESM e abre socket de verdade: aqui ele é inteiro simulado.
 *
 * Nada de `requireActual` — importar o módulo real neste ambiente falha, e o
 * que o teste precisa dele são dois números de código de desconexão e três
 * funções que nem chegam a ser exercitadas com credencial nova.
 */
jest.mock('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: jest.fn(() => {
    const ouvintes: Record<string, (evento: unknown) => void> = {};
    sockets.push({ ouvintes });
    return {
      ev: { on: (nome: string, fn: (evento: unknown) => void) => (ouvintes[nome] = fn) },
      end: jest.fn(),
      user: undefined,
    };
  }),
  DisconnectReason: { loggedOut: 401, connectionClosed: 428 },
  initAuthCreds: () => ({}),
  BufferJSON: { replacer: undefined, reviver: undefined },
  proto: { Message: { AppStateSyncKeyData: { fromObject: (o: unknown) => o } } },
}));

/**
 * `conectar` espera até 5s pelo QR aparecer. Com relógio falso essa espera só
 * anda se o teste adiantar o relógio — sem isto a promessa nunca resolve e o
 * teste morre no tempo limite antes de exercitar coisa alguma.
 */
async function conectar(servico: SessaoWhatsappService, tenant: string) {
  const promessa = servico.conectar(tenant);
  await jest.advanceTimersByTimeAsync(6_000);
  return promessa;
}

/** Derruba a conexão do socket mais recente, como o servidor do WhatsApp faria. */
function derrubar(motivo = DisconnectReason.connectionClosed) {
  const ultimo = sockets[sockets.length - 1];
  ultimo.ouvintes['connection.update']({
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: motivo } } },
  });
}

describe('SessaoWhatsappService — reconexão', () => {
  let servico: SessaoWhatsappService;
  const TENANT = 'loja-1';

  beforeEach(() => {
    jest.useFakeTimers();
    sockets.length = 0;

    const prisma = {
      whatsappSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      runAsSystem: jest.fn(async (fn: () => unknown) => fn()),
    } as unknown as PrismaService;

    servico = new SessaoWhatsappService(prisma);
  });

  afterEach(() => jest.useRealTimers());

  /**
   * O laço que passou despercebido.
   *
   * Uma credencial guardada que não completa o handshake derruba a conexão no
   * mesmo instante em que ela sobe. Com "toda queda que não é logout é
   * passageira" e reconexão imediata, isso vira um laço apertado: medido, 100
   * linhas de log a cada 20 segundos, sem fim, por uma loja que nunca ia
   * conectar. O teto e a espera são o que impedem isso de voltar.
   */
  it('desiste depois de cinco tentativas em vez de reconectar para sempre', async () => {
    await conectar(servico, TENANT);
    expect(sockets).toHaveLength(1);

    // Cada queda agenda a próxima tentativa; o relógio falso adianta a espera.
    for (let i = 0; i < 10; i++) {
      derrubar();
      await jest.advanceTimersByTimeAsync(60_000);
    }

    // 1 socket inicial + 5 reconexões, e para. Sem o teto seriam 11.
    expect(sockets).toHaveLength(6);
  });

  it('espera cada vez mais entre uma tentativa e outra', async () => {
    await conectar(servico, TENANT);

    derrubar();
    await jest.advanceTimersByTimeAsync(1_500);
    // A primeira espera é de 2s: com 1,5s no relógio ainda não tentou.
    expect(sockets).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(1_000);
    // Passados os 2s, reconectou.
    expect(sockets).toHaveLength(2);

    derrubar();
    await jest.advanceTimersByTimeAsync(3_000);
    // A segunda espera é maior que a primeira: 3s não bastam.
    expect(sockets).toHaveLength(2);
  });

  /**
   * Sem isto, uma loja com internet instável esgotaria a cota ao longo do dia e
   * ficaria offline até alguém perceber.
   */
  it('conectar zera a contagem de tentativas', async () => {
    await conectar(servico, TENANT);

    for (let i = 0; i < 4; i++) {
      derrubar();
      await jest.advanceTimersByTimeAsync(60_000);
    }
    expect(sockets).toHaveLength(5);

    sockets[sockets.length - 1].ouvintes['connection.update']({ connection: 'open' });

    // Com a contagem zerada, há cinco tentativas novas pela frente.
    for (let i = 0; i < 6; i++) {
      derrubar();
      await jest.advanceTimersByTimeAsync(60_000);
    }
    expect(sockets).toHaveLength(10);
  });

  it('deslogado no celular não tenta reconectar', async () => {
    await conectar(servico, TENANT);

    derrubar(DisconnectReason.loggedOut);
    await jest.advanceTimersByTimeAsync(60_000);

    // A credencial não vale mais: insistir nunca daria certo.
    expect(sockets).toHaveLength(1);
  });
});
