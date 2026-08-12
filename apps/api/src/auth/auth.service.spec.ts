import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { MailService } from '../mail/mail.service';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mail: any;

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
      refreshToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      passwordResetToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed-token'), verifyAsync: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    billingService = { subscribe: jest.fn().mockResolvedValue({}) };
    mail = {
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
      sendPasswordChanged: jest.fn().mockResolvedValue(undefined),
    };
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
        { provide: MailService, useValue: mail },
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
          pipelineStage: { createMany: jest.fn().mockResolvedValue({}) },
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
          pipelineStage: { createMany: jest.fn().mockResolvedValue({}) },
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
          pipelineStage: { createMany: jest.fn().mockResolvedValue({}) },
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

  describe('getProfile', () => {
    it('retorna o perfil sem dados sensíveis, com o nome do tenant', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ ...baseUser, tenant: { name: 'AutoPeças Demo' } });

      const profile = await service.getProfile('user-1');

      expect(profile).toEqual(
        expect.objectContaining({ id: 'user-1', name: 'Admin', email: 'admin@demo.local', tenantName: 'AutoPeças Demo' }),
      );
      expect(profile).not.toHaveProperty('passwordHash');
      expect(profile).not.toHaveProperty('twoFactorSecret');
      expect(profile).not.toHaveProperty('tenant');
    });
  });

  describe('changePassword', () => {
    it('rejeita quando a senha atual está incorreta', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-1', { currentPassword: 'errada', newPassword: 'NovaSenha123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('atualiza o hash quando a senha atual confere', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('novo-hash');

      await service.changePassword('user-1', { currentPassword: 'Demo1234', newPassword: 'NovaSenha123' });

      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { passwordHash: 'novo-hash' } });
    });
  });

  describe('forgotPassword', () => {
    const userComTenant = {
      ...baseUser,
      tenant: { name: 'Loja Demo', slug: 'demo' },
    };

    beforeEach(() => {
      prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({});
      (bcrypt.hash as jest.Mock).mockResolvedValue('hash-do-token');
    });

    it('exige o contexto de tenant', async () => {
      await expect(service.forgotPassword({ email: 'a@b.com' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('responde EXATAMENTE a mesma coisa para e-mail que existe e que não existe', async () => {
      // Se as respostas diferissem, esta rota pública viraria um verificador de
      // quais e-mails têm conta na loja.
      prisma.user.findUnique.mockResolvedValue(userComTenant);
      const existente = await tenantContext.run({ tenantId: 'tenant-1' }, () =>
        service.forgotPassword({ email: 'admin@demo.local' }),
      );

      prisma.user.findUnique.mockResolvedValue(null);
      const inexistente = await tenantContext.run({ tenantId: 'tenant-1' }, () =>
        service.forgotPassword({ email: 'ninguem@demo.local' }),
      );

      expect(existente).toEqual(inexistente);
      expect(mail.sendPasswordReset).toHaveBeenCalledTimes(1);
    });

    it('guarda apenas o hash do segredo, nunca o token que foi por e-mail', async () => {
      prisma.user.findUnique.mockResolvedValue(userComTenant);

      await tenantContext.run({ tenantId: 'tenant-1' }, () =>
        service.forgotPassword({ email: 'admin@demo.local' }),
      );

      const tokenEnviado = mail.sendPasswordReset.mock.calls[0][0].token;
      const gravado = prisma.passwordResetToken.create.mock.calls[0][0].data;

      expect(gravado.tokenHash).toBe('hash-do-token');
      expect(JSON.stringify(gravado)).not.toContain(tokenEnviado.split('.')[1]);
      // O id da linha vai no token para a validação achar o registro direto.
      expect(tokenEnviado.startsWith(`${gravado.id}.`)).toBe(true);
    });

    it('invalida os links anteriores antes de emitir um novo', async () => {
      prisma.user.findUnique.mockResolvedValue(userComTenant);

      await tenantContext.run({ tenantId: 'tenant-1' }, () =>
        service.forgotPassword({ email: 'admin@demo.local' }),
      );

      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', usedAt: null } }),
      );
    });

    it('não manda e-mail para usuário desativado', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...userComTenant, isActive: false });

      await tenantContext.run({ tenantId: 'tenant-1' }, () =>
        service.forgotPassword({ email: 'admin@demo.local' }),
      );

      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('falha no envio do e-mail não vira erro na resposta', async () => {
      // Além de não ajudar quem pediu, um erro aqui voltaria a diferenciar
      // e-mail existente de inexistente.
      prisma.user.findUnique.mockResolvedValue(userComTenant);
      mail.sendPasswordReset.mockRejectedValue(new Error('SMTP fora do ar'));

      await expect(
        tenantContext.run({ tenantId: 'tenant-1' }, () => service.forgotPassword({ email: 'admin@demo.local' })),
      ).resolves.toHaveProperty('message');
    });
  });

  describe('resetPassword', () => {
    const agora = new Date();
    const daquiUmaHora = new Date(agora.getTime() + 3_600_000);
    const registroValido = {
      id: 'token-1',
      userId: 'user-1',
      tokenHash: 'hash-guardado',
      expiresAt: daquiUmaHora,
      usedAt: null as Date | null,
      user: { ...baseUser, tenant: { name: 'Loja Demo' } },
    };

    const chamar = (token = 'token-1.segredo', novaSenha = 'NovaSenhaForte1') =>
      tenantContext.run({ tenantId: 'tenant-1' }, () =>
        service.resetPassword({ token, newPassword: novaSenha }),
      );

    beforeEach(() => {
      prisma.$transaction.mockResolvedValue([]);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hash-da-nova-senha');
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    });

    it('recusa token sem o formato id.segredo sem nem ir ao banco', async () => {
      await expect(chamar('token-sem-ponto')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.passwordResetToken.findUnique).not.toHaveBeenCalled();
    });

    it('recusa token já usado', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({ ...registroValido, usedAt: agora });
      await expect(chamar()).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('recusa token expirado', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...registroValido,
        expiresAt: new Date(agora.getTime() - 1000),
      });
      await expect(chamar()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa token de OUTRA empresa', async () => {
      // password_reset_tokens não tem tenantId, então o filtro automático do
      // Prisma não cobre este modelo: a checagem tem que ser explícita.
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...registroValido,
        user: { ...registroValido.user, tenantId: 'tenant-2' },
      });
      await expect(chamar()).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('recusa quando o segredo não bate com o hash guardado', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(registroValido);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(chamar()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('dá a mesma mensagem para todos os motivos de recusa', async () => {
      // Mensagens diferentes contariam a quem está tentando adivinhar se o
      // token existe, se expirou ou se já foi usado.
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      const inexistente = await chamar().catch((e) => e.message);

      prisma.passwordResetToken.findUnique.mockResolvedValue({ ...registroValido, usedAt: agora });
      const usado = await chamar().catch((e) => e.message);

      expect(inexistente).toBe(usado);
    });

    it('troca a senha, queima o token e derruba todas as sessões abertas', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(registroValido);

      await chamar();

      // As três operações vão numa transação só: senha trocada sem revogar as
      // sessões deixaria um invasor logado com o refresh token que já tem.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'hash-da-nova-senha' },
      });
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'token-1' } }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }),
      );
    });

    it('avisa o dono da conta que a senha mudou', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(registroValido);
      await chamar();
      expect(mail.sendPasswordChanged).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'admin@demo.local' }),
      );
    });
  });
});
