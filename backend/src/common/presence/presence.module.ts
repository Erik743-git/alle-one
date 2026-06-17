import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PresenceInterceptor } from './presence.interceptor';
import { PresenceService } from './presence.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PresenceService, PresenceInterceptor],
  exports: [PresenceService, PresenceInterceptor],
})
export class PresenceModule {}
