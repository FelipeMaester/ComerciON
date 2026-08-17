import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ModulesGuard } from './modules.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { TenantModulesService } from '../modules/tenant-modules.service';

describe('ModulesGuard', () => {
  let guard: ModulesGuard;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reflector: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let config: any;

  function makeContext(request: Record<string, unknown>) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;
  }

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    prisma = {
      subscription: { findUnique: jest.fn() },
      tenant: { findUnique: jest.fn() },
      // Consultado quando o tenant não tem assinatura: é o piso de acesso.
      plan: { findUnique: jest.fn().mockResolvedValue({ name: 'Trial', modules: ['CRM', 'SALES'] }) },
    };
    config = { get: (_key: string, def?: string) => def };
    // TenantModulesService real sobre o mesmo Prisma mockado: assim estes
    // testes continuam cobrindo a regra de negócio de ponta a ponta, agora
    // atravessando o serviço que o menu do painel também consulta.
    guard = new ModulesGuard(
      reflector,
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      new TenantModulesService(prisma as unknown as PrismaService),
    );
  });

  it('libera quando a rota não exige nenhum módulo', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(makeContext({ user: { tenantId: 'tenant-1' }, headers: {} }))).resolves.toBe(true);
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  it('libera quando não há tenant resolvível (sem user e sem header x-tenant-slug)', async () => {
    reflector.getAllAndOverride.mockReturnValue('WHATSAPP');
    await expect(guard.canActivate(makeContext({ headers: {} }))).resolves.toBe(true);
  });

  it('resolve o tenant pelo JWT de staff (request.user.tenantId)', async () => {
    reflector.getAllAndOverride.mockReturnValue('SALES');
    prisma.subscription.findUnique.mockResolvedValue(null);
    await guard.canActivate(makeContext({ user: { tenantId: 'tenant-1' }, headers: {} }));
    expect(prisma.subscription.findUnique).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' }, include: { plan: true } });
  });

  it('resolve o tenant pelo header x-tenant-slug quando não há JWT de staff (rota pública)', async () => {
    reflector.getAllAndOverride.mockReturnValue('SALES');
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-2' });
    prisma.subscription.findUnique.mockResolvedValue(null);

    await guard.canActivate(makeContext({ headers: { 'x-tenant-slug': 'demo' } }));

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { slug: 'demo' }, select: { id: true } });
    expect(prisma.subscription.findUnique).toHaveBeenCalledWith({ where: { tenantId: 'tenant-2' }, include: { plan: true } });
  });

  it('resolve o tenant pela query string ?tenant=slug quando não há header nem JWT (webhook de provedor externo)', async () => {
    reflector.getAllAndOverride.mockReturnValue('SALES');
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-3' });
    prisma.subscription.findUnique.mockResolvedValue(null);

    await guard.canActivate(makeContext({ headers: {}, query: { tenant: 'demo' } }));

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { slug: 'demo' }, select: { id: true } });
    expect(prisma.subscription.findUnique).toHaveBeenCalledWith({ where: { tenantId: 'tenant-3' }, include: { plan: true } });
  });

  // Antes, "sem assinatura" liberava TUDO. Era o caminho do desvio de plano:
  // um planKey inexistente no cadastro derrubava a assinatura em silêncio e a
  // loja saía com mais módulos que o Premium, de graça.
  it('tenant sem assinatura cai no plano gratuito, não em acesso total', async () => {
    reflector.getAllAndOverride.mockReturnValue('WHATSAPP');
    prisma.subscription.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(makeContext({ user: { tenantId: 'tenant-1' }, headers: {} }))).rejects.toThrow(
      /plano/i,
    );
    expect(prisma.plan.findUnique).toHaveBeenCalledWith({ where: { key: 'trial' } });
  });

  it('tenant sem assinatura continua com o que o gratuito inclui', async () => {
    reflector.getAllAndOverride.mockReturnValue('SALES');
    prisma.subscription.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(makeContext({ user: { tenantId: 'tenant-1' }, headers: {} }))).resolves.toBe(true);
  });

  it('sem nem o plano gratuito cadastrado, libera — banco não provisionado não pode travar o sistema', async () => {
    reflector.getAllAndOverride.mockReturnValue('WHATSAPP');
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.plan.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(makeContext({ user: { tenantId: 'tenant-1' }, headers: {} }))).resolves.toBe(true);
  });

  it('bloqueia quando a assinatura está cancelada', async () => {
    reflector.getAllAndOverride.mockReturnValue('WHATSAPP');
    prisma.subscription.findUnique.mockResolvedValue({ status: 'CANCELED', plan: { name: 'Pro', modules: ['WHATSAPP'] } });
    await expect(guard.canActivate(makeContext({ user: { tenantId: 'tenant-1' }, headers: {} }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('bloqueia quando o módulo não está incluído no plano', async () => {
    reflector.getAllAndOverride.mockReturnValue('WHATSAPP');
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE', plan: { name: 'Trial', modules: ['CRM', 'SALES'] } });
    await expect(guard.canActivate(makeContext({ user: { tenantId: 'tenant-1' }, headers: {} }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('libera quando o módulo está incluído no plano', async () => {
    reflector.getAllAndOverride.mockReturnValue('WHATSAPP');
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE', plan: { name: 'Premium', modules: ['WHATSAPP', 'BI'] } });
    await expect(guard.canActivate(makeContext({ user: { tenantId: 'tenant-1' }, headers: {} }))).resolves.toBe(true);
  });
});
