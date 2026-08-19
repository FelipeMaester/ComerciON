import { ModuleKey } from '@prisma/client';
import { AlertsService } from './alerts.service';

/**
 * O que estes testes protegem não é a contagem — é o julgamento embutido nela:
 * o que conta como "vencida", o que conta como "abaixo do mínimo", e o que a
 * loja não pode ver porque o plano dela não inclui.
 */
describe('AlertsService', () => {
  function montar(overrides: Record<string, unknown> = {}, modules = Object.values(ModuleKey)) {
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue([]) },
      financialEntry: { count: jest.fn().mockResolvedValue(0) },
      serviceOrder: { count: jest.fn().mockResolvedValue(0) },
      task: { count: jest.fn().mockResolvedValue(0) },
      cashSession: { count: jest.fn().mockResolvedValue(0) },
      ...overrides,
    };
    const tenantModules = { getForTenant: jest.fn().mockResolvedValue({ modules, planName: 'Premium', canceled: false }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new AlertsService(prisma as any, tenantModules as any);
    return { service, prisma, tenantModules };
  }

  it('loja em dia não recebe aviso nenhum', async () => {
    const { service } = montar();
    await expect(service.listar('loja-1')).resolves.toEqual({ avisos: [] });
  });

  it('conta com peça abaixo do mínimo somando todos os depósitos', async () => {
    // A peça tem 3 no depósito da frente e 2 no fundo: 5 no total, acima do
    // mínimo de 4. Olhar depósito por depósito acusaria falta que não existe.
    const { service } = montar({
      product: {
        findMany: jest.fn().mockResolvedValue([
          { minStock: 4, stockItems: [{ quantity: 3 }, { quantity: 2 }] },
          { minStock: 10, stockItems: [{ quantity: 1 }] },
        ]),
      },
    });

    const { avisos } = await service.listar('loja-1');
    const estoque = avisos.find((a) => a.chave === 'estoque-baixo');
    expect(estoque?.quantidade).toBe(1);
    expect(estoque?.titulo).toBe('1 peça abaixo do mínimo');
  });

  it('estoque exatamente no mínimo já conta — o mínimo é o piso, não a folga', async () => {
    const { service } = montar({
      product: { findMany: jest.fn().mockResolvedValue([{ minStock: 5, stockItems: [{ quantity: 5 }] }]) },
    });

    const { avisos } = await service.listar('loja-1');
    expect(avisos.find((a) => a.chave === 'estoque-baixo')?.quantidade).toBe(1);
  });

  it('peça sem mínimo declarado nunca vira aviso', async () => {
    // minStock = 0 é "não controlo mínimo para este item". Sem esta regra, o
    // sino encheria de peças zeradas que a loja nem repõe.
    const { service, prisma } = montar();
    await service.listar('loja-1');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where = (prisma.product.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.minStock).toEqual({ gt: 0 });
    expect(where.isActive).toBe(true);
  });

  it('conta vencida é decidida pela data, não pelo status OVERDUE', async () => {
    // O status depende de alguém ter rodado a rotina que o atualiza. Se o
    // aviso dependesse dele, uma conta vencida ontem só apareceria depois da
    // próxima varredura — que é justamente quando ninguém está olhando.
    const { service, prisma } = montar({ financialEntry: { count: jest.fn().mockResolvedValue(2) } });
    const { avisos } = await service.listar('loja-1');

    const where = (prisma.financialEntry.count as jest.Mock).mock.calls[0][0].where;
    expect(where.dueDate.lt).toBeInstanceOf(Date);
    expect(where.status.in).toEqual(expect.arrayContaining(['PENDING', 'OVERDUE']));

    expect(avisos.find((a) => a.chave === 'contas-a-pagar-vencidas')?.severidade).toBe('urgente');
  });

  it('sem o módulo Financeiro, conta vencida não aparece — o clique daria 403', async () => {
    const { service, prisma } = montar(
      { financialEntry: { count: jest.fn().mockResolvedValue(9) } },
      [ModuleKey.SALES, ModuleKey.INVENTORY],
    );

    const { avisos } = await service.listar('loja-1');
    expect(avisos.some((a) => a.chave.startsWith('contas-a-'))).toBe(false);
    // E nem chega a consultar: módulo desligado não custa consulta ao banco.
    expect(prisma.financialEntry.count).not.toHaveBeenCalled();
  });

  it('todo aviso leva a uma rota que resolve, já filtrada', async () => {
    const { service } = montar({
      product: { findMany: jest.fn().mockResolvedValue([{ minStock: 1, stockItems: [] }]) },
      financialEntry: { count: jest.fn().mockResolvedValue(1) },
      serviceOrder: { count: jest.fn().mockResolvedValue(1) },
      task: { count: jest.fn().mockResolvedValue(1) },
      cashSession: { count: jest.fn().mockResolvedValue(1) },
    });

    const { avisos } = await service.listar('loja-1');
    expect(avisos.length).toBeGreaterThan(0);
    for (const aviso of avisos) {
      expect(aviso.rota.startsWith('/')).toBe(true);
      expect(aviso.detalhe.length).toBeGreaterThan(0);
    }
  });

  it('o urgente vem antes do que pode esperar', async () => {
    const { service } = montar({
      product: { findMany: jest.fn().mockResolvedValue([{ minStock: 1, stockItems: [] }]) },
      financialEntry: { count: jest.fn().mockResolvedValue(1) },
      task: { count: jest.fn().mockResolvedValue(1) },
    });

    const { avisos } = await service.listar('loja-1');
    const ordem = avisos.map((a) => a.severidade);
    const peso = { urgente: 0, atencao: 1, informativo: 2 };
    expect(ordem).toEqual([...ordem].sort((a, b) => peso[a] - peso[b]));
  });
});

/**
 * O aviso preventivo: contas que ainda VÃO vencer.
 *
 * O sino só sabia falar do que já tinha vencido — quando o lembrete já não
 * evita nada. No fiado de balcão, o cliente costuma não pagar porque esqueceu,
 * e um aviso três dias antes resolve sem ninguém precisar cobrar.
 */
describe('AlertsService — contas a vencer', () => {
  function montar(contagens: { vencidas: number; aVencer: number }) {
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue([]) },
      financialEntry: {
        count: jest.fn().mockImplementation(({ where }) => {
          // A consulta de "a vencer" é a que tem piso E teto de data.
          const aVencer = where.dueDate?.gte !== undefined && where.dueDate?.lt !== undefined;
          return Promise.resolve(aVencer ? contagens.aVencer : contagens.vencidas);
        }),
      },
      serviceOrder: { count: jest.fn().mockResolvedValue(0) },
      task: { count: jest.fn().mockResolvedValue(0) },
      cashSession: { count: jest.fn().mockResolvedValue(0) },
    };
    const tenantModules = {
      getForTenant: jest.fn().mockResolvedValue({ modules: Object.values(ModuleKey), planName: 'Premium', canceled: false }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new AlertsService(prisma as any, tenantModules as any);
  }

  it('avisa o que vence nos próximos dias, como atenção e não como urgência', async () => {
    const service = montar({ vencidas: 0, aVencer: 2 });
    const { avisos } = await service.listar('loja-1');

    const aVencer = avisos.find((a) => a.chave === 'contas-a-vencer');
    expect(aVencer?.quantidade).toBe(2);
    expect(aVencer?.severidade).toBe('atencao');
    expect(aVencer?.titulo).toContain('3 dias');
    // Leva à lista já recortada — aviso que obriga a procurar não ajuda.
    expect(aVencer?.rota).toContain('situacao=a-vencer');
  });

  it('só conta o que está PENDENTE — vencida não está "a vencer"', async () => {
    const service = montar({ vencidas: 0, aVencer: 1 });
    await service.listar('loja-1');

    // A mesma dívida em dois avisos daria dois números que não somam com nada.
    const prisma = (service as unknown as { prisma: { financialEntry: { count: jest.Mock } } }).prisma;
    const consultaAVencer = prisma.financialEntry.count.mock.calls
      .map((c) => c[0].where)
      .find((w: { dueDate?: { gte?: Date; lt?: Date } }) => w.dueDate?.gte && w.dueDate?.lt);
    expect(consultaAVencer.status).toBe('PENDING');
  });

  it('o urgente do vencido vem antes do preventivo', async () => {
    const service = montar({ vencidas: 3, aVencer: 5 });
    const { avisos } = await service.listar('loja-1');

    const posicaoVencidas = avisos.findIndex((a) => a.chave === 'contas-a-receber-vencidas');
    const posicaoAVencer = avisos.findIndex((a) => a.chave === 'contas-a-vencer');
    expect(posicaoVencidas).toBeLessThan(posicaoAVencer);
  });
});
