import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';

/**
 * Popula o TenantContextService para a duração da requisição.
 *
 * - Requisição autenticada (staff): tenantId vem do payload do JWT (confiável,
 *   assinado pelo servidor) — nunca do header, para impedir que um usuário
 *   autenticado no tenant A tente acessar dados do tenant B trocando o header.
 * - Requisição autenticada (cliente da loja, Fase 3): mesma lógica, mas o
 *   token de cliente tem um shape diferente (sem `role`) e é assinado com um
 *   segredo totalmente separado. `userId` NUNCA é preenchido a partir de um
 *   token de cliente — AuditLog.userId tem FK para a tabela `users` (staff),
 *   e um customerId ali quebraria a integridade referencial. Distinguimos
 *   pelo campo `role`, presente só no payload de staff.
 * - Requisição pública (ex.: login, catálogo da loja): tenantId é resolvido a
 *   partir do header x-tenant-slug, necessário para localizar o registro
 *   certo dentro do tenant.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();

    const isStaffToken = Boolean(request.user && 'role' in request.user);
    let tenantId: string | undefined = request.user?.tenantId;
    const userId: string | undefined = isStaffToken ? request.user?.sub : undefined;
    const role: string | undefined = isStaffToken ? request.user?.role : undefined;

    if (!tenantId) {
      const headerName = this.config.get<string>('TENANT_HEADER', 'x-tenant-slug');
      const slugHeader = request.headers[headerName];
      if (slugHeader) {
        const tenant = await this.prisma.tenant.findUnique({
          where: { slug: String(slugHeader) },
          select: { id: true },
        });
        tenantId = tenant?.id;
      }
    }

    return new Observable((subscriber) => {
      this.tenantContext.run({ tenantId, userId, role }, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (error) => subscriber.error(error),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
