import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Customer, CustomerType, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import { ForgotPasswordDto } from '../auth/dto/forgot-password.dto';
import { ResetPasswordDto } from '../auth/dto/reset-password.dto';
import { MailService } from '../mail/mail.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { parseDurationToMs } from '../common/utils/parse-duration';
import { PrismaService } from '../prisma/prisma.service';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { RefreshCustomerTokenDto } from './dto/refresh-customer-token.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { CustomerJwtPayload } from './types/customer-jwt-payload.type';

@Injectable()
export class CustomerAuthService {
  private readonly saltRounds: number;
  private readonly logger = new Logger('CustomerAuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
    private readonly mail: MailService,
  ) {
    this.saltRounds = Number(this.config.get('BCRYPT_SALT_ROUNDS', 12));
  }

  async register(dto: RegisterCustomerDto) {
    const tenantId = this.requireTenantId();
    const email = dto.email.toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);

    const existing = await this.prisma.customer.findUnique({ where: { tenantId_email: { tenantId, email } } });

    let customer: Customer;
    if (existing) {
      // Cliente já existe no CRM (cadastrado por um atendente) mas nunca
      // acessou a loja — vincula a conta ao registro existente para manter
      // o histórico de compras, em vez de criar um segundo Customer duplicado.
      if (existing.passwordHash) {
        throw new ConflictException('Já existe uma conta com este e-mail');
      }
      customer = await this.prisma.customer.update({
        where: { id: existing.id },
        data: { passwordHash, name: dto.name, phone: dto.phone ?? existing.phone },
      });
    } else {
      customer = await this.prisma.customer.create({
        data: {
          tenantId,
          type: CustomerType.INDIVIDUAL,
          name: dto.name,
          email,
          phone: dto.phone,
          passwordHash,
        } as Prisma.CustomerUncheckedCreateInput,
      });
    }

    return this.issueTokens(customer);
  }

  async login(dto: LoginCustomerDto) {
    const tenantId = this.requireTenantId();
    const email = dto.email.toLowerCase();

    const customer = await this.prisma.customer.findUnique({ where: { tenantId_email: { tenantId, email } } });
    if (!customer || !customer.passwordHash || !customer.isActive) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const valid = await bcrypt.compare(dto.password, customer.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas');

    return this.issueTokens(customer);
  }

  async refresh(dto: RefreshCustomerTokenDto) {
    let payload: CustomerJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<CustomerJwtPayload>(dto.refreshToken, {
        secret: this.config.getOrThrow<string>('CUSTOMER_JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const customer = await this.tenantContext.run({ tenantId: payload.tenantId }, async () => {
      const candidates = await this.prisma.customerRefreshToken.findMany({
        where: { customerId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      });

      let matchedId: string | undefined;
      for (const candidate of candidates) {
        // eslint-disable-next-line no-await-in-loop
        if (await bcrypt.compare(dto.refreshToken, candidate.tokenHash)) {
          matchedId = candidate.id;
          break;
        }
      }
      if (!matchedId) throw new UnauthorizedException('Refresh token inválido, expirado ou já utilizado');

      await this.prisma.customerRefreshToken.update({ where: { id: matchedId }, data: { revokedAt: new Date() } });
      return this.prisma.customer.findUnique({ where: { id: payload.sub } });
    });

    if (!customer || !customer.isActive) throw new UnauthorizedException('Cliente inválido ou inativo');

    return this.issueTokens(customer);
  }

  /**
   * "Esqueci minha senha" do cliente da loja. Mesmas regras da versão da
   * equipe (ver AuthService.forgotPassword): resposta idêntica exista o
   * e-mail ou não, para esta rota pública não virar um verificador de quem
   * é cliente da loja.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const tenantId = this.requireTenantId();
    const email = dto.email.toLowerCase();

    const customer = await this.prisma.customer.findUnique({
      where: { tenantId_email: { tenantId, email } },
      include: { tenant: { select: { name: true, slug: true } } },
    });

    // passwordHash nulo = cliente cadastrado no CRM por um atendente que nunca
    // criou acesso à loja. Não há senha para redefinir; o caminho dele é o
    // cadastro, que já vincula ao registro existente.
    if (customer && customer.isActive && customer.passwordHash) {
      await this.prisma.customerPasswordResetToken.updateMany({
        where: { customerId: customer.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      const tokenId = randomUUID();
      const secret = randomBytes(32).toString('hex');

      await this.prisma.customerPasswordResetToken.create({
        data: {
          id: tokenId,
          customerId: customer.id,
          tokenHash: await bcrypt.hash(secret, this.saltRounds),
          expiresAt: new Date(Date.now() + MailService.PASSWORD_RESET_TTL_MINUTES * 60_000),
        },
      });

      try {
        await this.mail.sendCustomerPasswordReset({
          to: customer.email!,
          userName: customer.name,
          tenantName: customer.tenant.name,
          tenantSlug: customer.tenant.slug,
          token: `${tokenId}.${secret}`,
        });
      } catch (error) {
        this.logger.error(`Falha ao enviar e-mail de redefinição para ${customer.email}: ${(error as Error).message}`);
      }
    }

    return { message: 'Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tenantId = this.requireTenantId();
    const invalid = new BadRequestException('Link inválido ou expirado. Peça um novo.');

    const [tokenId, secret] = dto.token.split('.');
    if (!tokenId || !secret) throw invalid;

    const record = await this.prisma.customerPasswordResetToken.findUnique({
      where: { id: tokenId },
      include: { customer: true },
    });

    // customer_password_reset_tokens não tem tenantId, então o filtro
    // automático do Prisma não cobre este modelo — a checagem é explícita.
    if (
      !record ||
      record.usedAt ||
      record.expiresAt < new Date() ||
      record.customer.tenantId !== tenantId ||
      !record.customer.isActive
    ) {
      throw invalid;
    }

    if (!(await bcrypt.compare(secret, record.tokenHash))) throw invalid;

    const passwordHash = await bcrypt.hash(dto.newPassword, this.saltRounds);

    await this.prisma.$transaction([
      this.prisma.customer.update({ where: { id: record.customerId }, data: { passwordHash } }),
      this.prisma.customerPasswordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.customerRefreshToken.updateMany({
        where: { customerId: record.customerId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Senha alterada. Você já pode entrar com a nova senha.' };
  }

  async me(customerId: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    return this.toResponse(customer);
  }

  private requireTenantId(): string {
    const tenantId = this.tenantContext.tenantId;
    if (!tenantId) throw new BadRequestException('Header x-tenant-slug é obrigatório');
    return tenantId;
  }

  private async issueTokens(customer: Customer) {
    const payload: CustomerJwtPayload = { sub: customer.id, tenantId: customer.tenantId, email: customer.email ?? '' };

    const accessExpiresIn = this.config.get<string>('CUSTOMER_JWT_ACCESS_EXPIRES_IN', '30m');
    const refreshExpiresIn = this.config.get<string>('CUSTOMER_JWT_REFRESH_EXPIRES_IN', '30d');

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('CUSTOMER_JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('CUSTOMER_JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn,
    });

    const tokenHash = await bcrypt.hash(refreshToken, this.saltRounds);
    await this.prisma.customerRefreshToken.create({
      data: {
        customerId: customer.id,
        tokenHash,
        expiresAt: new Date(Date.now() + parseDurationToMs(refreshExpiresIn)),
      },
    });

    return { customer: this.toResponse(customer), accessToken, refreshToken };
  }

  private toResponse(customer: Customer) {
    const { passwordHash, ...rest } = customer;
    return rest;
  }
}
