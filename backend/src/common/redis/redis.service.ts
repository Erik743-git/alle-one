import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private enabled = false;

  onModuleInit() {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      this.logger.warn(
        'REDIS_URL não definido — filas usam fallback in-process/cron.',
      );
      return;
    }

    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });
      this.client.on('ready', () => {
        this.enabled = true;
        this.logger.log('Redis conectado');
      });
      this.client.on('error', (err) => {
        this.enabled = false;
        this.logger.warn(`Redis error: ${err.message}`);
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao criar cliente Redis: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
      this.client = null;
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled && this.client != null;
  }

  getClient(): Redis | null {
    return this.client;
  }

  async ping(): Promise<'up' | 'down' | 'disabled'> {
    if (!process.env.REDIS_URL?.trim()) return 'disabled';
    if (!this.client) return 'down';
    try {
      const pong = await this.client.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
