import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CompaniesController } from './companies.controller';
import { CompaniesSessionController } from './companies-session.controller';
import { CompaniesService } from './companies.service';

@Module({
  imports: [PrismaModule],
  controllers: [CompaniesController, CompaniesSessionController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
