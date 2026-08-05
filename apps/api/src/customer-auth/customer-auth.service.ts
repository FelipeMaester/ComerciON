import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Customer, CustomerType, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tenantContext: TenantContextService,
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
