import { SessaoWhatsappService } from './sessao-whatsapp.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PosseDaSessaoService } from './posse-da-sessao.service';

/**
 * Com uma instância só no teste, ela é sempre a dona — que é o comportamento
 * de produção com uma réplica. A disputa entre instâncias tem spec próprio.
 */
const posse = {
  instanciaId: 'teste',
  tentarAssumir: jest.fn().mockResolvedValue(true),
  minhasLojas: jest.fn().mockResolvedValue([]),
  renovar: jest.fn().mockResolvedValue({ perdidas: [] }),
  largar: jest.fn().mockResolvedValue(undefined),
} as unknown as PosseDaSessaoService;

/** Os ouvintes que o serviço registrou no socket, para o teste disparar. */
let ouvintes: Record<string, (evento: unknown) => void>;

/** O estado de autenticação que o serviço entregou ao Baileys. */
let estadoEntregue: {
  creds: unknown;
  keys: {
    get: (tipo: string, ids: string[]) => Promise<Record<string, unknown>>;
    set: (dados: Record<string, Record<string, unknown> | undefined>) => Promise<void>;
  };
};

/**
 * O Baileys é ESM e não carrega no Jest — o spec de reconexão já documenta
 * isso. Aqui ele é simulado, mas com uma diferença importante: o `BufferJSON`
 * é um DUBLÊ FIEL, e não um `undefined`.
 *
 * A razão: o que mudou nesta correção não foi o BufferJSON (biblioteca
 * intocada), foi ONDE ele é aplicado — antes uma vez sobre o estado inteiro,
 * agora uma vez por chave. Se o replacer sair na gravação ou o reviver na
 * leitura, os Buffers viram objetos comuns e a loja para de descriptografar
 * na primeira mensagem, sem erro nenhum antes disso. Com o dublê valendo
 * `undefined`, o teste passaria com o erro presente.
 */
jest.mock('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: jest.fn((opcoes: { auth: typeof estadoEntregue }) => {
    estadoEntregue = opcoes.auth;
    ouvintes = {};
    return {
      ev: { on: (nome: string, fn: (evento: unknown) => void) => (ouvintes[nome] = fn) },
      end: jest.fn(),
      user: undefined,
    };
  }),
  DisconnectReason: { loggedOut: 401, connectionClosed: 428 },
  initAuthCreds: () => ({ meuId: 'creds-novas' }),
  BufferJSON: {
    replacer: (_chave: string, valor: unknown) => {
      const v = valor as { type?: string; data?: unknown };
      if (Buffer.isBuffer(valor) || v?.type === 'Buffer') {
        return { type: 'Buffer', data: Buffer.from((v?.data as never) ?? (valor as never)).toString('base64') };
      }
      return valor;
    },
    reviver: (_chave: string, valor: unknown) => {
      const v = valor as { type?: string; data?: string };
      if (typeof valor === 'object' && valor !== null && v.type === 'Buffer') {
        return Buffer.from(v.data as string, 'base64');
      }
      return valor;
    },
  },
  proto: { Message: { AppStateSyncKeyData: { fromObject: (o: unknown) => o } } },
}));

describe('SessaoWhatsappService — chaves gravadas uma a uma', () => {
  const TENANT = 'loja-1';
  let servico: SessaoWhatsappService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  beforeEach(async () => {
    jest.useFakeTimers();
    prisma = {
      whatsappSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      whatsappAuthKey: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn((args: unknown) => args),
        deleteMany: jest.fn((args: unknown) => args),
      },
      $transaction: jest.fn().mockResolvedValue([]),
      runAsSystem: jest.fn(async (fn: () => unknown) => fn()),
    };
    servico = new SessaoWhatsappService(prisma as unknown as PrismaService, posse);

    const promessa = servico.conectar(TENANT);
    await jest.advanceTimersByTimeAsync(6_000);
    await promessa;
  });

  afterEach(() => jest.useRealTimers());

  /**
   * O defeito que originou a mudança.
   *
   * O Baileys chama `keys.set` a cada mensagem trocada. Antes, cada chamada
   * serializava e regravava o estado INTEIRO: medido com o material de 1.000
   * contatos, 1.038 KB por mensagem, linha reescrita e WAL do mesmo tamanho.
   */
  it('gravar uma chave não regrava a sessão inteira', async () => {
    prisma.whatsappSession.upsert.mockClear();

    await estadoEntregue.keys.set({ session: { '5511900000001@s.whatsapp.net': { estado: 'novo' } } });

    // Uma linha gravada, e a linha da sessão intocada.
    expect(prisma.whatsappAuthKey.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.whatsappSession.upsert).not.toHaveBeenCalled();
    expect(prisma.whatsappAuthKey.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_tipo_chaveId: { tenantId: TENANT, tipo: 'session', chaveId: '5511900000001@s.whatsapp.net' },
        },
      }),
    );
  });

  it('lê só as chaves que o Baileys pediu', async () => {
    await estadoEntregue.keys.get('session', ['a@s.whatsapp.net', 'b@s.whatsapp.net']);

    expect(prisma.whatsappAuthKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, tipo: 'session', chaveId: { in: ['a@s.whatsapp.net', 'b@s.whatsapp.net'] } },
      }),
    );
  });

  it('sem ids pedidos, não consulta o banco', async () => {
    prisma.whatsappAuthKey.findMany.mockClear();
    expect(await estadoEntregue.keys.get('session', [])).toEqual({});
    expect(prisma.whatsappAuthKey.findMany).not.toHaveBeenCalled();
  });

  /**
   * O Baileys apaga uma chave mandando null nela — é assim que uma pre-key
   * consumida sai do estado. Sem tratar, elas se acumulariam para sempre.
   */
  it('valor nulo apaga a chave em vez de gravar null', async () => {
    await estadoEntregue.keys.set({ 'pre-key': { '7': null as unknown as Record<string, unknown> } });

    expect(prisma.whatsappAuthKey.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, tipo: 'pre-key', chaveId: '7' },
    });
    expect(prisma.whatsappAuthKey.upsert).not.toHaveBeenCalled();
  });

  it('o lote de uma mensagem vai numa transação só', async () => {
    await estadoEntregue.keys.set({
      session: { a: { x: 1 }, b: { x: 2 } },
      'pre-key': { '1': null as unknown as Record<string, unknown> },
    });

    // Gravar metade do lote deixaria a sessão num estado que não
    // descriptografa — pior que não gravar nada.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(3);
  });

  /**
   * O que quebra a criptografia se estiver errado.
   *
   * As chaves do Signal são Buffers. Um JSON.stringify comum os transforma em
   * `{"type":"Buffer","data":[…]}`, que volta como objeto comum — e aí o
   * Baileys não decifra nada, sem erro nenhum antes disso. O BufferJSON era
   * aplicado uma vez sobre o estado inteiro; agora é uma vez por chave, e é
   * essa mudança de lugar que este teste cobre.
   */
  it('Buffer sobrevive à ida e à volta, agora chave a chave', async () => {
    const chaveOriginal = Buffer.from([0xde, 0xad, 0xbe, 0xef]);

    await estadoEntregue.keys.set({ session: { alvo: { material: chaveOriginal } } });
    const gravado = prisma.whatsappAuthKey.upsert.mock.calls[0][0].create.valor;

    // No banco não vai Buffer: vai a forma serializável do BufferJSON.
    expect(Buffer.isBuffer(gravado.material)).toBe(false);
    expect(gravado.material).toEqual({ type: 'Buffer', data: chaveOriginal.toString('base64') });

    // E na leitura volta Buffer, com os mesmos bytes.
    prisma.whatsappAuthKey.findMany.mockResolvedValue([{ chaveId: 'alvo', valor: gravado }]);
    const lido = await estadoEntregue.keys.get('session', ['alvo']);

    const material = (lido.alvo as { material: Buffer }).material;
    expect(Buffer.isBuffer(material)).toBe(true);
    expect(material.equals(chaveOriginal)).toBe(true);
  });

  /**
   * A outra metade da separação: o que sobra no blob.
   *
   * Se as chaves continuassem viajando junto com as credenciais, gravar
   * chave a chave não teria adiantado nada — o creds.update dispara com
   * frequência e levaria o estado inteiro de novo.
   */
  it('creds.update grava só as credenciais, sem chave nenhuma junto', async () => {
    await estadoEntregue.keys.set({ session: { a: { x: 1 } } });
    prisma.whatsappSession.upsert.mockClear();

    // É o próprio serviço que liga `salvar` a este evento.
    ouvintes['creds.update']({});
    await Promise.resolve();
    await Promise.resolve();

    expect(prisma.whatsappSession.upsert).toHaveBeenCalledTimes(1);
    const gravado = prisma.whatsappSession.upsert.mock.calls[0][0];
    expect(Object.keys(gravado.update.credenciais)).toEqual(['creds']);
  });
});
