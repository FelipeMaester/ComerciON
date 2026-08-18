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
