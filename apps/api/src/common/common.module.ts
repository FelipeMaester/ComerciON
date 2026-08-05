import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TenantContextInterceptor } from './tenant/tenant-context.interceptor';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ModulesGuard } from './guards/modules.guard';

// TenantContextService NÃO é provido aqui — vive no PrismaModule (@Global())
// como singleton único compartilhado por toda a aplicação. Ver o comentário lá.
@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ModulesGuard },
    // Ordem importa: TenantContextInterceptor precisa envolver o AuditInterceptor
    // para que o contexto de tenant/usuário já esteja populado quando ele rodar.
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class CommonModule {}
