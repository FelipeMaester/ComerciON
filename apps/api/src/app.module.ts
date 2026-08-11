import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { CustomerAuthModule } from './customer-auth/customer-auth.module';
import { CouponsModule } from './coupons/coupons.module';
import { StorefrontModule } from './storefront/storefront.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { LogisticsModule } from './logistics/logistics.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ReportsModule } from './reports/reports.module';
import { BillingModule } from './billing/billing.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { SettingsModule } from './settings/settings.module';
import { QuotesModule } from './quotes/quotes.module';
import { ServiceOrdersModule } from './service-orders/service-orders.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { AiModule } from './ai/ai.module';
import { TasksModule } from './tasks/tasks.module';
import { AutomationsModule } from './automations/automations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuditModule,
    CommonModule,
    AuthModule,
    UsersModule,
    HealthModule,
    CustomersModule,
    SuppliersModule,
    ProductsModule,
    InventoryModule,
    SalesModule,
    FinanceModule,
    CustomerAuthModule,
    CouponsModule,
    StorefrontModule,
    FiscalModule,
    LogisticsModule,
    WhatsappModule,
    ReportsModule,
    BillingModule,
    SuperAdminModule,
    SettingsModule,
    QuotesModule,
    ServiceOrdersModule,
    OpportunitiesModule,
    AiModule,
    TasksModule,
    AutomationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
