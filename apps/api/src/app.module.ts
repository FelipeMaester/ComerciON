import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { CustomersModule } from './customers/customers.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { ProductsModule } from './products/products.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { FinanceModule } from './finance/finance.module';
import { CouponsModule } from './coupons/coupons.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ReportsModule } from './reports/reports.module';
import { BillingModule } from './billing/billing.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { SettingsModule } from './settings/settings.module';
import { QuotesModule } from './quotes/quotes.module';
import { ServiceOrdersModule } from './service-orders/service-orders.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { MailModule } from './mail/mail.module';
import { SchedulingModule } from './common/scheduling/scheduling.module';
import { TasksModule } from './tasks/tasks.module';
import { AutomationsModule } from './automations/automations.module';
import { CashModule } from './cash/cash.module';
import { AlertsModule } from './alerts/alerts.module';
import { ThrottlerEmPortuguesGuard } from './common/guards/throttler-em-portugues.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    // Teto de requisições por minuto, por cliente. O padrão de 100 protege
    // contra varredura e uso abusivo sem incomodar loja nenhuma — o painel faz
    // cerca de três chamadas por tela.
    //
    // Configurável porque a suíte de ponta a ponta faz o trabalho de uma tarde
    // inteira em um minuto, do mesmo IP: sem subir o teto lá, metade dos testes
    // toma 429 e parece defeito. Medido numa execução da suíte: a tela de
    // "Minha conta" apareceu com o erro do limitador no lugar do conteúdo.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.GLOBAL_RATE_LIMIT ?? 100) }]),
    PrismaModule,
    AuditModule,
    CommonModule,
    MailModule,
    SchedulingModule,
    AuthModule,
    UsersModule,
    HealthModule,
    CustomersModule,
    SuppliersModule,
    ProductsModule,
    InventoryModule,
    SalesModule,
    FinanceModule,
    CouponsModule,
    FiscalModule,
    WhatsappModule,
    ReportsModule,
    BillingModule,
    SuperAdminModule,
    SettingsModule,
    QuotesModule,
    ServiceOrdersModule,
    OpportunitiesModule,
    TasksModule,
    AutomationsModule,
    CashModule,
    AlertsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerEmPortuguesGuard }],
})
export class AppModule {}
