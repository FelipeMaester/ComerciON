import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';

// TenantContextService vive aqui (não no CommonModule) porque precisa ser um
// singleton verdadeiramente global: é o AsyncLocalStorage compartilhado entre
// o PrismaService (lê o tenant atual) e os interceptors (escrevem o tenant
// atual). Duas instâncias separadas quebrariam o isolamento silenciosamente.
@Global()
@Module({
  providers: [PrismaService, TenantContextService],
  exports: [PrismaService, TenantContextService],
})
export class PrismaModule {}
