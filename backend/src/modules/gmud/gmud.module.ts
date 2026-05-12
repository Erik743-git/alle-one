import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GmudController } from './gmud.controller';
import { GmudService } from './gmud.service';
import { GmudMailService } from './mail/gmud-mail.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [GmudController],
  providers: [GmudService, GmudMailService],
})
export class GmudModule {}
