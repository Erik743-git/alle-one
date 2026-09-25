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
import { PresenceModule } from './common/presence/presence.module';
import { PresenceInterceptor } from './common/presence/presence.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ZabbixModule } from './modules/zabbix/zabbix.module';
import { TifluxModule } from './modules/tiflux/tiflux.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { GrafanaModule } from './modules/grafana/grafana.module';
import { GmudModule } from './modules/gmud/gmud.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { FinancialModule } from './modules/financial/financial.module';
import { AdminModule } from './modules/admin/admin.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { UsageAlertsModule } from './modules/usage-alerts/usage-alerts.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RendimentoModule } from './modules/rendimento/rendimento.module';
import { MuralModule } from './modules/mural/mural.module';
import { AgendasModule } from './modules/agendas/agendas.module';
import { OportunidadesModule } from './modules/oportunidades/oportunidades.module';
import { MailboxModule } from './modules/mailbox/mailbox.module';
import { InventarioModule } from './modules/inventario/inventario.module';
import { ProjetosModule } from './modules/projetos/projetos.module';
import { ConsoleModule } from './modules/console/console.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { IntegrationsHealthJob } from './integrations/integrations-health.job';
import { RedisModule } from './common/redis/redis.module';
import { EmailInboundModule } from './modules/email-inbound/email-inbound.module';
import { PlantaoModule } from './modules/plantao/plantao.module';
import { AcessoModule } from './modules/acesso/acesso.module';
import { NpsModule } from './modules/nps/nps.module';
import { FechamentoModule } from './modules/fechamento/fechamento.module';
import { CargaModule } from './modules/carga/carga.module';
import { ContratoAvisoModule } from './modules/contrato-aviso/contrato-aviso.module';
import { AcessoModuloGuard } from './modules/acesso/acesso-modulo.guard';

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
    RedisModule,
    SecurityModule,
    PrismaModule,
    PresenceModule,
    AuditModule,
    AcessoModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    ZabbixModule,
    TifluxModule,
    DashboardModule,
    GrafanaModule,
    GmudModule,
    ContractsModule,
    FinancialModule,
    AdminModule,
    PermissionsModule,
    UsageAlertsModule,
    ReportsModule,
    RendimentoModule,
    MuralModule,
    AgendasModule,
    OportunidadesModule,
    MailboxModule,
    InventarioModule,
    ProjetosModule,
    ConsoleModule,
    TicketsModule,
    EmailInboundModule,
    PlantaoModule,
    NpsModule,
    FechamentoModule,
    CargaModule,
    ContratoAvisoModule,
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
      // Depois do JWT: módulo desligado em Acesso por perfil → 403.
      provide: APP_GUARD,
      useClass: AcessoModuloGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: PresenceInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
