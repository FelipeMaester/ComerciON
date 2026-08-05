import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TenantStatus, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { AuditService } from '../audit/audit.service';
import { parseDurationToMs } from '../common/utils/parse-duration';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  private readonly saltRounds: number;
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly billingService: BillingService,
  ) {
    // ConfigService.get<number>() é só um hint de tipo, não converte em runtime —
    // env vars sempre chegam como string. bcrypt trata um saltRounds string como
    // um salt literal em vez de um cost factor e quebra com "Invalid salt".
    this.saltRounds = Number(this.config.get('BCRYPT_SALT_ROUNDS', 12));
  }

  async registerTenant(dto: RegisterTenantDto) {
    const existingSlug = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
    if (existingSlug) {
      throw new ConflictException('Este identificador de empresa já está em uso');
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword, this.saltRounds);

    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug: dto.tenantSlug,
          document: dto.tenantDocument,
        },
      });

      // A criação abaixo passa tenantId explicitamente porque ainda não
      // existe contexto de tenant nesta requisição (o tenant acaba de nascer).
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: dto.adminName,
          email: dto.adminEmail.toLowerCase(),
          passwordHash,
          role: UserRole.ADMIN,
        },
      });

      // Depósito padrão: sem isso, o módulo de estoque da Fase 1 não teria
      // onde registrar quantidades até o usuário criar um depósito manualmente.
      await tx.warehouse.create({
        data: { tenantId: tenant.id, name: 'Loja Principal', isDefault: true },
      });

      return { tenant, user };
    });

    await this.audit.log({
      tenantId: tenant.id,
      userId: user.id,
      action: 'TENANT_REGISTERED',
      entity: 'Tenant',
      entityId: tenant.id,
    });

    // Fora da transação de propósito, mesma razão de sempre: assinatura não
    // é atômica com a criação do tenant. Se falhar (ex.: plano inválido), o
    // tenant fica sem assinatura — e o ModulesGuard trata "sem assinatura"
    // como acesso liberado, então o pior caso é o tenant ficar sem nenhuma
    // restrição de módulo, nunca travado por um erro aqui.
    try {
      await this.billingService.subscribe(tenant.id, dto.planKey ?? 'trial');
    } catch (error) {
      this.logger.warn(`Não foi possível associar o plano inicial ao tenant ${tenant.id}: ${(error as Error).message}`);
    }

    const tokens = await this.issueTokens(user);
    return { tenant: this.toTenantResponse(tenant), user: this.toUserResponse(user), ...tokens };
  }

  async login(dto: LoginDto) {
    const tenantId = this.tenantContext.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Header x-tenant-slug é obrigatório para login');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.status === TenantStatus.SUSPENDED || tenant.status === TenantStatus.CANCELED) {
      throw new UnauthorizedException('Esta empresa está com o acesso suspenso. Entre em contato com o suporte.');
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email.toLowerCase() } },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      await this.audit.log({
        tenantId,
        userId: user.id,
        action: 'LOGIN_FAILED',
        entity: 'User',
        entityId: user.id,
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (user.twoFactorEnabled) {
      if (!dto.twoFactorCode) {
        throw new UnauthorizedException('Código de autenticação de dois fatores obrigatório');
      }
      const codeValid = authenticator.check(dto.twoFactorCode, user.twoFactorSecret!);
      if (!codeValid) {
        throw new UnauthorizedException('Código de autenticação de dois fatores inválido');
      }
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ tenantId, userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id });

    const tokens = await this.issueTokens(user);
    return { user: this.toUserResponse(user), ...tokens };
  }

  async refresh(dto: RefreshTokenDto) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(dto.refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    // Escopo explícito pelo tenant do próprio token verificado — não confia
    // em nenhum header, já que esta rota é pública e o access token expirou.
    const user = await this.tenantContext.run({ tenantId: payload.tenantId }, async () => {
      const candidateTokens = await this.prisma.refreshToken.findMany({
        where: { userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      });

      let matchedTokenId: string | undefined;
      for (const candidate of candidateTokens) {
        // eslint-disable-next-line no-await-in-loop
        if (await bcrypt.compare(dto.refreshToken, candidate.tokenHash)) {
          matchedTokenId = candidate.id;
          break;
        }
      }

      if (!matchedTokenId) {
        throw new UnauthorizedException('Refresh token inválido, expirado ou já utilizado');
      }

      // Rotação: revoga o token usado antes de emitir o próximo par.
      await this.prisma.refreshToken.update({
        where: { id: matchedTokenId },
        data: { revokedAt: new Date() },
      });

      return this.prisma.user.findUnique({ where: { id: payload.sub } });
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuário inválido ou inativo');
    }

    const tokens = await this.issueTokens(user);
    return { user: this.toUserResponse(user), ...tokens };
  }

  async logout(userId: string, refreshToken: string) {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
    });
    for (const token of tokens) {
      // eslint-disable-next-line no-await-in-loop
      if (await bcrypt.compare(refreshToken, token.tokenHash)) {
        await this.prisma.refreshToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } });
        break;
      }
    }
  }

  async generateTwoFactorSecret(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: secret } });

    const issuer = this.config.get<string>('TOTP_ISSUER', 'ComercioERP');
    const otpauthUrl = authenticator.keyuri(user.email, issuer, secret);
    return { secret, otpauthUrl };
  }

  async enableTwoFactor(userId: string, tenantId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Gere um secret de 2FA antes de habilitar');
    }
    if (!authenticator.check(code, user.twoFactorSecret)) {
      throw new UnauthorizedException('Código inválido');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
    await this.audit.log({ tenantId, userId, action: 'TWO_FA_ENABLED', entity: 'User', entityId: userId });
  }

  async disableTwoFactor(userId: string, tenantId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.twoFactorSecret || !authenticator.check(code, user.twoFactorSecret)) {
      throw new UnauthorizedException('Código inválido');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    await this.audit.log({ tenantId, userId, action: 'TWO_FA_DISABLED', entity: 'User', entityId: userId });
  }

  private async issueTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    };

    const accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn,
    });

    const tokenHash = await bcrypt.hash(refreshToken, this.saltRounds);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + parseDurationToMs(refreshExpiresIn)),
      },
    });

    return { accessToken, refreshToken };
  }

  private toUserResponse(user: User) {
    const { passwordHash, twoFactorSecret, ...rest } = user;
    return rest;
  }

  private toTenantResponse(tenant: { id: string; name: string; slug: string; status: string; plan: string }) {
    return tenant;
  }
}
