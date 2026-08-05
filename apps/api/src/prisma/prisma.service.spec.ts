import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
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
