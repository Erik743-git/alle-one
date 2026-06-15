import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { SecurityModule } from './common/security/security.module';
import { JwtGlobalAuthGuard } from './modules/auth/guards/jwt-global-auth.guard';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './modules/audit/audit.module';
import { AuditInterceptor } from './modules/audit/audit.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ZabbixModule } from './modules/zabbix/zabbix.module';
import { TifluxModule } from './modules/tiflux/tiflux.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { GmudModule } from './modules/gmud/gmud.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { FinancialModule } from './modules/financial/financial.module';
import { AdminModule } from './modules/admin/admin.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { UsageAlertsModule } from './modules/usage-alerts/usage-alerts.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RendimentoModule } from './modules/rendimento/rendimento.module';
import { MailboxModule } from './modules/mailbox/mailbox.module';
import { InventarioModule } from './modules/inventario/inventario.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { IntegrationsHealthJob } from './integrations/integrations-health.job';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 200,
      },
    ]),
    ScheduleModule.forRoot(),
    SecurityModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    ZabbixModule,
    TifluxModule,
    DashboardModule,
    GmudModule,
    ContractsModule,
    FinancialModule,
    AdminModule,
    PermissionsModule,
    UsageAlertsModule,
    ReportsModule,
    RendimentoModule,
    MailboxModule,
    InventarioModule,
    TicketsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    IntegrationsHealthJob,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtGlobalAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
