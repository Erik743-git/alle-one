import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async health(): Promise<{
    ok: boolean;
    service: string;
    database: 'up' | 'down';
  }> {
    let database: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    if (database === 'down') {
      throw new ServiceUnavailableException({
        ok: false,
        service: 'alle-one-api',
        database,
      });
    }

    return { ok: true, service: 'alle-one-api', database };
  }
}
