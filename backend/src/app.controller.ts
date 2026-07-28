import {
  Controller,
  Get,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { HealthIntegrationsAccessGuard } from './modules/auth/guards/health-integrations-access.guard';
import { RedisService } from './common/redis/redis.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  async health(): Promise<{
    ok: boolean;
    service: string;
    database: 'up' | 'down';
    redis: 'up' | 'down' | 'disabled';
  }> {
    let database: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    const redis = await this.redis.ping();

    if (database === 'down') {
      throw new ServiceUnavailableException({
        ok: false,
        service: 'alle-one-api',
        database,
        redis,
      });
    }

    return { ok: true, service: 'alle-one-api', database, redis };
  }

  /** Público no JWT global; acesso real via token interno ou ADMIN. */
  @Public()
  @UseGuards(HealthIntegrationsAccessGuard)
  @Get('health/integrations')
  async healthIntegrations() {
    return this.appService.getIntegrationsHealth();
  }
}
