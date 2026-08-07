import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserRole, UserStatus } from '@prisma/client';
import { AppService } from '../app.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailboxService } from '../modules/mailbox/mailbox.service';
import { isTifluxDisconnected } from '../modules/tickets/tickets-portal.config';

@Injectable()
export class IntegrationsHealthJob {
  private readonly logger = new Logger(IntegrationsHealthJob.name);
  private lastStaleAlertAt = 0;

  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly mailbox: MailboxService,
  ) {}

  /** A cada hora: alerta admins se sync TiFlux estiver stale. */
  @Cron('0 0 * * * *')
  async checkTifluxSyncHealth(): Promise<void> {
    try {
      if (isTifluxDisconnected()) {
        await this.mailbox.clearTifluxSyncStaleAlerts();
        return;
      }

      const health = await this.appService.getIntegrationsHealth();

      if (health.tifluxSync.status !== 'stale') {
        await this.mailbox.clearTifluxSyncStaleAlerts();
        return;
      }

      const cooldownHours = Number(
        process.env.TIFLUX_SYNC_STALE_ALERT_COOLDOWN_HOURS ?? 6,
      );
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      if (Date.now() - this.lastStaleAlertAt < cooldownMs) return;

      const admins = await this.prisma.user.findMany({
        where: {
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!admins.length) return;

      await this.mailbox.notifyTifluxSyncStale(
        admins.map((a) => a.id),
        health.tifluxSync.message ??
          'Sync TiFlux possivelmente parado. Verifique alleone-tiflux-sync.',
        health.tifluxSync.lastTicketUpdate,
      );

      this.lastStaleAlertAt = Date.now();
      this.logger.warn(
        `Alerta sync stale enviado a ${admins.length} admin(s): ${health.tifluxSync.message}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha no job integrations health: ${msg}`);
    }
  }
}
