import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  tenantId?: string;
  userId?: string;
  role?: string;
}

/**
 * Contexto por-requisição (via AsyncLocalStorage) usado pelo PrismaService
 * para aplicar o isolamento de tenant automaticamente em toda a árvore de
 * chamadas assíncronas de uma requisição, sem precisar passar tenantId
 * manualmente por todos os services.
 */
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.als.run(context, callback);
  }

  get(): RequestContext | undefined {
    return this.als.getStore();
  }

  get tenantId(): string | undefined {
    return this.als.getStore()?.tenantId;
  }

  get userId(): string | undefined {
    return this.als.getStore()?.userId;
  }

  get role(): string | undefined {
    return this.als.getStore()?.role;
  }
}
