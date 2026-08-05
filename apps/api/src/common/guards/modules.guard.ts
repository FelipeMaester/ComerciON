import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ModuleKey } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRES_MODULE_KEY } from '../decorators/requires-module.decorator';

/**
 * Gate de módulo por plano (Fase 7). Tenants sem assinatura (provisionados
 * manualmente, ou legados de antes deste recurso existir) mantêm acesso
 * total — só passam a ser restritos a partir do momento em que assinam um
 * plano de verdade, para não quebrar nada que já funcionava.
 *
 * Resolve o tenantId por conta própria (staff JWT ou header x-tenant-slug),
 * igual ao TenantContextInterceptor — NÃO dá para usar TenantContextService
 * aqui, porque guards rodam ANTES dos interceptors no ciclo de vida do
 * Nest, então o contexto de tenant ainda não existiria quando este guard
 * executasse (bug real, encontrado testando o cadastro self-service: o
 * gate nunca bloqueava nada porque tenantContext.tenantId sempre vinha
 * undefined neste ponto).
 */
@Injectable()
export class ModulesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ModuleKey | undefined>(REQUIRES_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    let tenantId: string | undefined = request.user?.tenantId;

    if (!tenantId) {
      const headerName = this.config.get<string>('TENANT_HEADER', 'x-tenant-slug');
      const slugHeader = request.headers[headerName];
      if (slugHeader) {
        const tenant = await this.prisma.tenant.findUnique({ where: { slug: String(slugHeader) }, select: { id: true } });
        tenantId = tenant?.id;
      }
    }
    if (!tenantId) return true;

    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
    if (!subscription) return true;

    if (subscription.status === 'CANCELED') {
      throw new ForbiddenException('Assinatura cancelada — reative o plano para usar este módulo.');
    }
    if (!subscription.plan.modules.includes(required)) {
      throw new ForbiddenException(`Este módulo não está incluído no seu plano atual (${subscription.plan.name}). Faça upgrade em /billing.`);
    }
    return true;
  }
}
