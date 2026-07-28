import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, type JobsOptions } from 'bullmq';
import { RedisService } from './redis.service';

export const EMAIL_INBOUND_QUEUE = 'email-inbound';

export type EmailInboundJobData = {
  mailboxAddress: string;
  messageId: string;
  graphMessageId: string;
};

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private emailInboundQueue: Queue | null = null;

  constructor(private readonly redis: RedisService) {}

  private ensureEmailQueue(): Queue | null {
    if (this.emailInboundQueue) return this.emailInboundQueue;
    const url = process.env.REDIS_URL?.trim();
    if (!url || !this.redis.isEnabled()) return null;

    this.emailInboundQueue = new Queue(EMAIL_INBOUND_QUEUE, {
      connection: { url },
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    });
    return this.emailInboundQueue;
  }

  async enqueueEmailInbound(
    data: EmailInboundJobData,
    opts?: JobsOptions,
  ): Promise<{ queued: boolean; jobId?: string }> {
    const queue = this.ensureEmailQueue();
    if (!queue) {
      this.logger.debug(
        `Fila Redis indisponível; job email-inbound ${data.messageId} ficará para o poller.`,
      );
      return { queued: false };
    }

    const job = await queue.add('ingest', data, {
      jobId: `msg:${data.messageId}`.slice(0, 120),
      ...opts,
    });
    return { queued: true, jobId: job.id };
  }

  async onModuleDestroy() {
    if (this.emailInboundQueue) {
      await this.emailInboundQueue.close().catch(() => undefined);
      this.emailInboundQueue = null;
    }
  }
}
