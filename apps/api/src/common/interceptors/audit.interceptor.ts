import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../audit/audit.service';
import { TenantContextService } from '../tenant/tenant-context.service';

const SENSITIVE_KEYS = new Set([
  'password',
  'adminPassword',
  'refreshToken',
  'accessToken',
  'passwordHash',
  'twoFactorSecret',
  'code',
]);

// Já auditados explicitamente (com mensagens de negócio melhores) dentro do AuthService.
const SKIP_PATH_PREFIXES = ['/api/auth/login', '/api/auth/refresh', '/api/auth/register-tenant'];
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function sanitize(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined;
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([key, value]) => [
      key,
      SENSITIVE_KEYS.has(key) ? '[REDACTED]' : value,
    ]),
  );
}

/**
 * Log de auditoria genérico para toda requisição mutante (POST/PUT/PATCH/DELETE).
 * Fica registrado quem fez o quê e quando, mesmo em rotas que ainda não têm
 * lógica de auditoria de negócio própria.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl, ip, body } = request;

    if (!MUTATING_METHODS.has(method) || SKIP_PATH_PREFIXES.some((prefix) => originalUrl.startsWith(prefix))) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        this.audit
          .log({
            tenantId: this.tenantContext.tenantId,
            userId: this.tenantContext.userId,
            action: method,
            entity: originalUrl.split('?')[0],
            metadata: sanitize(body),
            ip,
          })
          .catch(() => undefined); // auditoria não pode derrubar a requisição principal
      }),
    );
  }
}
