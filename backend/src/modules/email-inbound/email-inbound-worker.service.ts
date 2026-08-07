import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from '../../common/redis/redis.service';
import {
  EMAIL_INBOUND_QUEUE,
  type EmailInboundJobData,
} from '../../common/redis/queue.service';
import { EmailInboundIngestService } from './email-inbound-ingest.service';

@Injectable()
export class EmailInboundWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EmailInboundWorkerService.name);
  private worker: Worker | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly ingest: EmailInboundIngestService,
  ) {}

  onModuleInit() {
    const url = process.env.REDIS_URL?.trim();
    if (!url || !this.redis.isEnabled()) {
      this.logger.warn(
        'Worker BullMQ email-inbound desligado (sem Redis). Poller cron permanece ativo.',
      );
      return;
    }

    this.worker = new Worker<EmailInboundJobData>(
      EMAIL_INBOUND_QUEUE,
      async (job) => {
        await this.ingest.ingestGraphMessage(job.data);
      },
      {
        connection: { url },
        concurrency: 2,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.warn(
        `Job email-inbound falhou id=${job?.id}: ${err.message}`,
      );
    });
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close().catch(() => undefined);
      this.worker = null;
    }
  }
}
