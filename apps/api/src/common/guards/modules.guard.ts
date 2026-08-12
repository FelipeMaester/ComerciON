import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ModuleKey } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { REQUIRES_MODULE_KEY } from '../decorators/requires-module.decorator';
import { TenantModulesService } from '../modules/tenant-modules.service';

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
    private readonly tenantModules: TenantModulesService,
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
      // Webhooks de provedor externo (ex.: Twilio) não permitem configurar
      // headers customizados na URL — só a query string (?tenant=slug).
      const slugValue = request.headers[headerName] ?? request.query?.tenant;
      if (slugValue) {
        const tenant = await this.prisma.tenant.findUnique({ where: { slug: String(slugValue) }, select: { id: true } });
        tenantId = tenant?.id;
      }
    }
    if (!tenantId) return true;

    // O cálculo vive no TenantModulesService, que é a MESMA fonte consultada
    // pelo menu do painel. Duplicar aqui foi o que quase fez o menu mostrar
    // itens que a API recusa.
    const { modules, planName, canceled } = await this.tenantModules.getForTenant(tenantId);

    if (canceled) {
      throw new ForbiddenException('Assinatura cancelada — reative o plano para usar este módulo.');
    }
    if (!modules.includes(required)) {
      throw new ForbiddenException(`Este módulo não está incluído no seu plano atual (${planName}). Faça upgrade em /billing.`);
    }
    return true;
  }
}
