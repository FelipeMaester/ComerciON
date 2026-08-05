import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';

jest.mock('bcrypt');
jest.mock('otplib', () => ({
  authenticator: {
    check: jest.fn(),
    generateSecret: jest.fn(),
    keyuri: jest.fn(),
  },
}));

describe('AuthService', () => {
  let service: AuthService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jwt: any;
  let tenantContext: TenantContextService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let audit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let billingService: any;

  const baseUser = {
    id: 'user-1',
    tenantId: 'tenant-1',
    name: 'Admin',
    email: 'admin@demo.local',
    passwordHash: 'hashed',
    role: UserRole.ADMIN,
    isActive: true,
    twoFactorEnabled: false,
    twoFactorSecret: null as string | null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      tenant: { findUnique: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
      refreshToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed-token'), verifyAsync: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    billingService = { subscribe: jest.fn().mockResolvedValue({}) };
    tenantContext = new TenantContextService();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          useValue: { get: (_key: string, def?: any) => def, getOrThrow: (key: string) => `secret-${key}` },
        },
        { provide: TenantContextService, useValue: tenantContext },
        { provide: AuditService, useValue: audit },
        { provide: BillingService, useValue: billingService },
      ],
    }).compile();

    service = moduleRef.get(AuthService);

    prisma.refreshToken.create.mockResolvedValue({});
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-refresh-token');
  });

  afterEach(() => jest.clearAllMocks());

  describe('login', () => {
    beforeEach(() => {
      prisma.tenant.findUnique.mockResolvedValue({ id: baseUser.tenantId, status: 'ACTIVE' });
    });

    it('lança BadRequestException se não houver contexto de tenant (header x-tenant-slug ausente)', async () => {
      await expect(service.login({ email: baseUser.email, password: '123456' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('lança UnauthorizedException quando o tenant está suspenso, antes mesmo de checar a senha', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: baseUser.tenantId, status: 'SUSPENDED' });

      await tenantContext.run({ tenantId: baseUser.tenantId }, async () => {
        await expect(
          service.login({ email: baseUser.email, password: 'correta' }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      });

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('lança UnauthorizedException com senha incorreta e registra auditoria de falha', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await tenantContext.run({ tenantId: baseUser.tenantId }, async () => {
        await expect(
          service.login({ email: baseUser.email, password: 'errada' }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN_FAILED', userId: baseUser.id }),
      );
    });

    it('retorna tokens em login bem-sucedido sem 2FA, sem vazar passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.user.update.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await tenantContext.run({ tenantId: baseUser.tenantId }, () =>
        service.login({ email: baseUser.email, password: 'correta' }),
      );

      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.user as any).passwordHash).toBeUndefined();
    });

    it('exige twoFactorCode quando o usuário tem 2FA habilitado', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        twoFactorEnabled: true,
        twoFactorSecret: 'SECRET',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await tenantContext.run({ tenantId: baseUser.tenantId }, async () => {
        await expect(
          service.login({ email: baseUser.email, password: 'correta' }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      });
    });
  });

  describe('registerTenant', () => {
    it('lança ConflictException se o slug do tenant já existir', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.registerTenant({
          tenantName: 'Empresa',
          tenantSlug: 'ja-existe',
          adminName: 'Admin',
          adminEmail: 'a@a.com',
          adminPassword: 'Senha1234',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('cria tenant e usuário admin dentro de uma transação e audita o evento', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      const createdTenant = {
        id: 'tenant-2',
        name: 'Nova Empresa',
        slug: 'nova-empresa',
        status: 'TRIAL',
        plan: 'trial',
      };
      const createdUser = { ...baseUser, id: 'user-2', tenantId: 'tenant-2' };

      prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
        cb({
          tenant: { create: jest.fn().mockResolvedValue(createdTenant) },
          user: { create: jest.fn().mockResolvedValue(createdUser) },
          warehouse: { create: jest.fn().mockResolvedValue({ id: 'warehouse-1', name: 'Loja Principal' }) },
        }),
      );

      const result = await service.registerTenant({
        tenantName: 'Nova Empresa',
        tenantSlug: 'nova-empresa',
        adminName: 'Admin',
        adminEmail: 'admin@nova.com',
        adminPassword: 'Senha1234',
      });

      expect(result.tenant.slug).toBe('nova-empresa');
      expect(result.accessToken).toBe('signed-token');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'TENANT_REGISTERED' }));
      expect(billingService.subscribe).toHaveBeenCalledWith('tenant-2', 'trial');
    });

    it('usa o planKey informado em vez do padrão "trial"', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
        cb({
          tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-3', slug: 'outra-empresa', status: 'TRIAL', plan: 'trial' }) },
          user: { create: jest.fn().mockResolvedValue({ ...baseUser, id: 'user-3', tenantId: 'tenant-3' }) },
          warehouse: { create: jest.fn().mockResolvedValue({ id: 'warehouse-2', name: 'Loja Principal' }) },
        }),
      );

      await service.registerTenant({
        tenantName: 'Outra Empresa',
        tenantSlug: 'outra-empresa',
        adminName: 'Admin',
        adminEmail: 'admin@outra.com',
        adminPassword: 'Senha1234',
        planKey: 'pro',
      });

      expect(billingService.subscribe).toHaveBeenCalledWith('tenant-3', 'pro');
    });

    it('não deixa uma falha ao assinar o plano quebrar o cadastro do tenant', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
        cb({
          tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-4', slug: 'quarta-empresa', status: 'TRIAL', plan: 'trial' }) },
          user: { create: jest.fn().mockResolvedValue({ ...baseUser, id: 'user-4', tenantId: 'tenant-4' }) },
          warehouse: { create: jest.fn().mockResolvedValue({ id: 'warehouse-3', name: 'Loja Principal' }) },
        }),
      );
      billingService.subscribe.mockRejectedValue(new Error('plano inválido'));

      const result = await service.registerTenant({
        tenantName: 'Quarta Empresa',
        tenantSlug: 'quarta-empresa',
        adminName: 'Admin',
        adminEmail: 'admin@quarta.com',
        adminPassword: 'Senha1234',
      });

      expect(result.accessToken).toBe('signed-token');
    });
  });
});
