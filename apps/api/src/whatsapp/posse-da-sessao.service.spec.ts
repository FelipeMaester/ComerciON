import { PosseDaSessaoService, VALIDADE_DA_POSSE_MS } from './posse-da-sessao.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Um Postgres de mentira, com a semântica que decide tudo aqui: o
 * `updateMany` só altera a linha se a condição bater, e o `create` estoura se
 * a loja já tem dona.
 *
 * Sem essa semântica no dublê, os testes de disputa passariam mesmo com a
 * condição errada no `where` — que é justamente onde o defeito moraria.
 */
function bancoDeMentira() {
  const linhas = new Map<string, { tenantId: string; instanciaId: string; expiraEm: Date }>();

  const prisma = {
    runAsSystem: async (fn: () => unknown) => fn(),
    whatsappSessionOwner: {
      updateMany: async ({ where, data }: never) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = where as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        const alvos = w.tenantId?.in ?? [w.tenantId];
        let count = 0;
        for (const t of alvos) {
          const atual = linhas.get(t);
          if (!atual) continue;
          const casa = w.OR
            ? w.OR.some(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (c: any) =>
                  (c.instanciaId && atual.instanciaId === c.instanciaId) ||
                  (c.expiraEm?.lt && atual.expiraEm < c.expiraEm.lt),
              )
            : !w.instanciaId || atual.instanciaId === w.instanciaId;
          if (!casa) continue;
          linhas.set(t, { ...atual, ...d, tenantId: t });
          count++;
        }
        return { count };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: any) => {
        if (linhas.has(data.tenantId)) throw new Error('unique violation');
        linhas.set(data.tenantId, data);
        return data;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where }: any) =>
        [...linhas.values()]
          .filter((l) => l.instanciaId === where.instanciaId && l.expiraEm > where.expiraEm.gt)
          .map((l) => ({ tenantId: l.tenantId })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deleteMany: async ({ where }: any) => {
        let count = 0;
        for (const t of where.tenantId.in) {
          const atual = linhas.get(t);
          if (atual && atual.instanciaId === where.instanciaId) {
            linhas.delete(t);
            count++;
          }
        }
        return { count };
      },
    },
  } as unknown as PrismaService;

  return { prisma, linhas };
}

describe('PosseDaSessaoService', () => {
  const AGORA = new Date('2026-09-08T12:00:00.000Z');

  /**
   * O defeito que isto existe para resolver.
   *
   * O WhatsApp derruba a segunda conexão da mesma conta. Antes, cada instância
   * abria socket para TODAS as lojas no boot: com duas instâncias, elas se
   * derrubavam em círculo, e por isso o sistema não podia ter réplica nenhuma.
   */
  it('duas instâncias disputando a mesma loja: só uma leva', async () => {
    const { prisma } = bancoDeMentira();
    const a = new PosseDaSessaoService(prisma);
    const b = new PosseDaSessaoService(prisma);

    const [ficouComA, ficouComB] = await Promise.all([
      a.tentarAssumir('loja-1', AGORA),
      b.tentarAssumir('loja-1', AGORA),
    ]);

    expect([ficouComA, ficouComB].filter(Boolean)).toHaveLength(1);
  });

  it('cada instância tem um id próprio — duas na mesma máquina não se confundem', () => {
    const { prisma } = bancoDeMentira();
    expect(new PosseDaSessaoService(prisma).instanciaId).not.toBe(
      new PosseDaSessaoService(prisma).instanciaId,
    );
  });

  it('quem já é dono renova sem perder a posse', async () => {
    const { prisma, linhas } = bancoDeMentira();
    const a = new PosseDaSessaoService(prisma);

    await a.tentarAssumir('loja-1', AGORA);
    const depois = new Date(AGORA.getTime() + 20_000);
    expect(await a.tentarAssumir('loja-1', depois)).toBe(true);

    expect(linhas.get('loja-1')?.instanciaId).toBe(a.instanciaId);
    expect(linhas.get('loja-1')?.expiraEm).toEqual(new Date(depois.getTime() + VALIDADE_DA_POSSE_MS));
  });

  /**
   * A instância dona morreu. A loja não pode ficar sem WhatsApp para sempre.
   */
  it('posse vencida é assumida por outra instância', async () => {
    const { prisma } = bancoDeMentira();
    const morta = new PosseDaSessaoService(prisma);
    const viva = new PosseDaSessaoService(prisma);

    await morta.tentarAssumir('loja-1', AGORA);

    // Antes de vencer, ninguém toma.
    const antes = new Date(AGORA.getTime() + VALIDADE_DA_POSSE_MS - 1_000);
    expect(await viva.tentarAssumir('loja-1', antes)).toBe(false);

    // Depois de vencer, toma.
    const depois = new Date(AGORA.getTime() + VALIDADE_DA_POSSE_MS + 1_000);
    expect(await viva.tentarAssumir('loja-1', depois)).toBe(true);
  });

  /**
   * O caso que faria o defeito voltar por outro caminho: a instância travou,
   * outra assumiu, e a primeira volta a si achando que ainda é dona. Se ela
   * mantiver o socket, voltam a existir duas conexões para a mesma conta.
   */
  it('quem perdeu a posse enquanto travava descobre na renovação', async () => {
    const { prisma } = bancoDeMentira();
    const travada = new PosseDaSessaoService(prisma);
    const outra = new PosseDaSessaoService(prisma);

    await travada.tentarAssumir('loja-1', AGORA);
    const depoisDoVencimento = new Date(AGORA.getTime() + VALIDADE_DA_POSSE_MS + 1_000);
    await outra.tentarAssumir('loja-1', depoisDoVencimento);

    const { perdidas } = await travada.renovar(['loja-1'], depoisDoVencimento);

    expect(perdidas).toEqual(['loja-1']);
  });

  it('renovar não devolve como perdida a loja que continua sendo minha', async () => {
    const { prisma } = bancoDeMentira();
    const a = new PosseDaSessaoService(prisma);
    await a.tentarAssumir('loja-1', AGORA);

    const { perdidas } = await a.renovar(['loja-1'], new Date(AGORA.getTime() + 20_000));

    expect(perdidas).toEqual([]);
  });

  it('largar solta a loja na hora, para outra assumir sem esperar o prazo', async () => {
    const { prisma } = bancoDeMentira();
    const saindo = new PosseDaSessaoService(prisma);
    const entrando = new PosseDaSessaoService(prisma);

    await saindo.tentarAssumir('loja-1', AGORA);
    await saindo.largar(['loja-1']);

    // Sem esperar o vencimento.
    expect(await entrando.tentarAssumir('loja-1', AGORA)).toBe(true);
  });

  it('largar não solta a loja de outra instância', async () => {
    const { prisma, linhas } = bancoDeMentira();
    const dona = new PosseDaSessaoService(prisma);
    const intrusa = new PosseDaSessaoService(prisma);

    await dona.tentarAssumir('loja-1', AGORA);
    await intrusa.largar(['loja-1']);

    expect(linhas.get('loja-1')?.instanciaId).toBe(dona.instanciaId);
  });
});
