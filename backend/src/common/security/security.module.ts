import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TenantScopeService } from './tenant-scope.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [TenantScopeService],
  exports: [TenantScopeService],
})
export class SecurityModule {}
