import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import {
  NpsAdminController,
  NpsPublicController,
  PopupSatisfacaoController,
} from './nps.controller';
import { NpsJob } from './nps.job';
import { NpsService } from './nps.service';
import { PopupSatisfacaoService } from './popup-satisfacao.service';

@Module({
  imports: [MailModule],
  controllers: [
    NpsPublicController,
    PopupSatisfacaoController,
    NpsAdminController,
  ],
  providers: [NpsService, PopupSatisfacaoService, NpsJob],
  exports: [NpsService],
})
export class NpsModule {}
