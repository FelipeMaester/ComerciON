import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FORA_DO_ESCOPO_AUTOMATICO, PrismaService, TENANT_SCOPED_MODELS } from './prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';

type MiddlewareFn = (params: Record<string, any>, next: (params: Record<string, any>) => Promise<any>) => Promise<any>;

describe('PrismaService — isolamento de tenant', () => {
  let tenantContext: TenantContextService;
  let prisma: PrismaService;
  let middleware: MiddlewareFn;
  const next = jest.fn(async (params: Record<string, any>) => params);

  beforeEach(() => {
    tenantContext = new TenantContextService();
    prisma = new PrismaService(tenantContext);
    // Captura a função de middleware sem chamar onModuleInit/$connect —
    // este teste exercita só a lógica de escopo, não a conexão real com o banco.
    jest.spyOn(prisma, '$use').mockImplementation(((fn: MiddlewareFn) => {
      middleware = fn;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
    (prisma as unknown as { applyTenantScoping: () => void }).applyTenantScoping();
    next.mockClear();
  });

  it('injeta tenantId em creates quando há contexto', async () => {
    await tenantContext.run({ tenantId: 'tenant-1' }, () =>
      middleware({ model: 'User', action: 'create', args: { data: { name: 'Ana' } } }, next),
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ args: { data: { name: 'Ana', tenantId: 'tenant-1' } } }),
    );
  });

  it('permite create com tenantId explícito mesmo sem contexto (bootstrap de registro de tenant)', async () => {
    await middleware(
      { model: 'User', action: 'create', args: { data: { name: 'Ana', tenantId: 'tenant-bootstrap' } } },
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ args: { data: { name: 'Ana', tenantId: 'tenant-bootstrap' } } }),
    );
  });

  it('lança ForbiddenException em create sem contexto de tenant e sem tenantId explícito', async () => {
    await expect(
      middleware({ model: 'User', action: 'create', args: { data: { name: 'Ana' } } }, next),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('injeta tenantId no where de findMany quando há contexto', async () => {
    await tenantContext.run({ tenantId: 'tenant-1' }, () =>
      middleware({ model: 'User', action: 'findMany', args: { where: { isActive: true } } }, next),
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ args: { where: { isActive: true, tenantId: 'tenant-1' } } }),
    );
  });

  it('contexto de um tenant nunca filtra pelo tenantId de outro (sobrescreve where malicioso)', async () => {
    await tenantContext.run({ tenantId: 'tenant-legitimo' }, () =>
      middleware(
        { model: 'User', action: 'findMany', args: { where: { tenantId: 'tenant-outro' } } },
        next,
      ),
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ args: { where: { tenantId: 'tenant-legitimo' } } }),
    );
  });

  it('não mexe em modelos fora do escopo de tenant (ex.: Tenant)', async () => {
    await middleware({ model: 'Tenant', action: 'findMany', args: { where: {} } }, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ args: { where: {} } }));
  });
});

/**
 * O teste que impede o vazamento silencioso.
 *
 * O filtro por loja é uma lista escrita à mão. Criar uma tabela nova com
 * `tenantId` e esquecer de acrescentá-la ali não quebra nada, não aparece no
 * type-check e não falha em nenhum teste — o sistema simplesmente passa a
 * mostrar as linhas de todas as lojas naquela tabela. É o pior tipo de defeito:
 * silencioso, e num sistema multiempresa é o mais grave que existe.
 *
 * Aqui o schema de verdade (DMMF, o mesmo que o Prisma usa) é conferido contra
 * as duas listas. Tabela com `tenantId` que não esteja em nenhuma das duas
 * reprova a suíte, com o nome dela na mensagem.
 */
describe('PrismaService — nenhuma tabela fica sem decisão', () => {
  const modelosComTenantId = Prisma.dmmf.datamodel.models
    .filter((modelo) => modelo.fields.some((campo) => campo.name === 'tenantId'))
    .map((modelo) => modelo.name);

  it('toda tabela com tenantId está no filtro automático ou na lista de exceções', () => {
    const semDecisao = modelosComTenantId.filter(
      (nome) => !TENANT_SCOPED_MODELS.has(nome) && !FORA_DO_ESCOPO_AUTOMATICO.has(nome),
    );

    expect(semDecisao).toEqual([]);
  });

  it('as listas não citam tabelas que não existem mais', () => {
    const todasAsTabelas = new Set(Prisma.dmmf.datamodel.models.map((modelo) => modelo.name));
    const fantasmas = [...TENANT_SCOPED_MODELS, ...FORA_DO_ESCOPO_AUTOMATICO].filter(
      (nome) => !todasAsTabelas.has(nome),
    );

    expect(fantasmas).toEqual([]);
  });

  it('nenhuma tabela sem tenantId aparece no filtro automático', () => {
    const comTenantId = new Set(modelosComTenantId);
    const indevidas = [...TENANT_SCOPED_MODELS].filter((nome) => !comTenantId.has(nome));

    expect(indevidas).toEqual([]);
  });
});
