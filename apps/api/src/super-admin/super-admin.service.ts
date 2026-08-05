import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

/**
 * Visão de plataforma para o super-admin: enxerga todos os tenants de uma
 * vez (Tenant/Subscription/Plan não são tenant-scoped, então essas
 * consultas não precisam — e não devem — passar pelo isolamento normal).
 * Nunca expõe dados de negócio de um tenant específico (vendas, clientes
 * etc.) — só o que é da própria plataforma (status, plano, faturas).
 */
@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  async listTenants() {
    return this.prisma.tenant.findMany({
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true, invoices: { orderBy: { createdAt: 'desc' } } } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');
    return tenant;
  }

  async updateStatus(id: string, status: TenantStatus) {
    await this.getTenant(id);
    return this.prisma.tenant.update({ where: { id }, data: { status } });
  }

  /** Override manual do plano (ex.: pagamento confirmado por outro canal). */
  async changePlan(id: string, planKey: string) {
    await this.getTenant(id);
    return this.billingService.subscribe(id, planKey);
  }
}
