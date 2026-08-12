import { JobLockService } from './job-lock.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Simula o advisory lock do Postgres: um Set global de chaves em uso,
 * compartilhado entre as "instâncias", que é exatamente o comportamento que
 * o banco dá de verdade (o lock é do servidor, não do processo).
 */
function fakePrisma(heldKeys: Set<string>) {
  return {
    runAsSystem: <T>(fn: () => Promise<T>) => fn(),
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, key: bigint) => {
      const sql = strings.join('');
      const id = String(key);
      if (sql.includes('pg_try_advisory_lock')) {
        if (heldKeys.has(id)) return [{ locked: false }];
        heldKeys.add(id);
        return [{ locked: true }];
      }
      heldKeys.delete(id);
      return [{}];
    }),
  } as unknown as PrismaService;
}

describe('JobLockService', () => {
  it('executa o trabalho quando consegue o lock', async () => {
    const service = new JobLockService(fakePrisma(new Set()));
    const work = jest.fn().mockResolvedValue(undefined);

    await expect(service.runExclusively('job-a', work)).resolves.toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('NÃO executa quando outra instância está com o lock', async () => {
    // O cenário que motiva tudo isto: duas instâncias da API acordam às 6h.
    const banco = new Set<string>();
    const instanciaA = new JobLockService(fakePrisma(banco));
    const instanciaB = new JobLockService(fakePrisma(banco));

    let liberar!: () => void;
    const trabalhoLongo = new Promise<void>((resolve) => (liberar = resolve));

    const cobrancaA = jest.fn().mockReturnValue(trabalhoLongo);
    const cobrancaB = jest.fn().mockResolvedValue(undefined);

    const rodandoA = instanciaA.runExclusively('billing:recurring', cobrancaA);
    const resultadoB = await instanciaB.runExclusively('billing:recurring', cobrancaB);

    expect(resultadoB).toBe(false);
    expect(cobrancaB).not.toHaveBeenCalled(); // ninguém foi cobrado duas vezes

    liberar();
    await expect(rodandoA).resolves.toBe(true);
    expect(cobrancaA).toHaveBeenCalledTimes(1);
  });

  it('libera o lock mesmo se o trabalho lançar erro', async () => {
    // Sem isto, uma falha numa madrugada travaria o job para sempre.
    const banco = new Set<string>();
    const service = new JobLockService(fakePrisma(banco));

    await expect(service.runExclusively('job-c', async () => { throw new Error('falhou'); })).rejects.toThrow('falhou');
    expect(banco.size).toBe(0);

    const depois = jest.fn().mockResolvedValue(undefined);
    await expect(service.runExclusively('job-c', depois)).resolves.toBe(true);
    expect(depois).toHaveBeenCalled();
  });

  it('jobs diferentes não competem pelo mesmo lock', async () => {
    const banco = new Set<string>();
    const service = new JobLockService(fakePrisma(banco));

    let liberar!: () => void;
    const emAndamento = new Promise<void>((resolve) => (liberar = resolve));
    const primeiro = service.runExclusively('billing:recurring', () => emAndamento);

    const outro = jest.fn().mockResolvedValue(undefined);
    await expect(service.runExclusively('whatsapp:daily-automations', outro)).resolves.toBe(true);
    expect(outro).toHaveBeenCalled();

    liberar();
    await primeiro;
  });

  it('a chave cabe num bigint com sinal do Postgres', async () => {
    const banco = new Set<string>();
    const prisma = fakePrisma(banco);
    const service = new JobLockService(prisma);

    // Vários nomes, porque o estouro depende do hash: um valor acima de
    // 2^63-1 seria rejeitado pelo Postgres em runtime, não na compilação.
    for (const nome of ['a', 'billing:recurring', 'whatsapp:daily-automations', 'zzz', 'job-ção']) {
      // eslint-disable-next-line no-await-in-loop
      await service.runExclusively(nome, async () => {});
    }

    const MAX_BIGINT = 2n ** 63n - 1n;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const call of (prisma.$queryRaw as any).mock.calls) {
      const key = call[1] as bigint;
      expect(key).toBeGreaterThanOrEqual(0n);
      expect(key).toBeLessThanOrEqual(MAX_BIGINT);
    }
  });
});
