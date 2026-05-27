import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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
import { TifluxSyncModule } from './modules/tiflux-sync/tiflux-sync.module';

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
    PrismaModule,
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
    TifluxSyncModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
