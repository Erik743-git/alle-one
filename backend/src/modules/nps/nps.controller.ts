import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ConfigNpsDto,
  DispensarPopupDto,
  PainelNpsQueryDto,
  ResponderNpsDto,
} from './nps.dto';
import { NpsService } from './nps.service';
import { PopupSatisfacaoService } from './popup-satisfacao.service';

type Req = { user: AuthenticatedRequestUser };

/**
 * Resposta do NPS pelo link do e-mail, sem login: o token (48 hex) é da
 * pessoa para quem foi enviado. Limite por IP contra tentativa de adivinhar.
 */
@Controller('nps')
export class NpsPublicController {
  constructor(private readonly nps: NpsService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token')
  obter(@Param('token') token: string) {
    return this.nps.obterPorToken(token);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':token')
  responder(@Param('token') token: string, @Body() dto: ResponderNpsDto) {
    return this.nps.responder(token, {
      nota: dto.nota,
      comentario: dto.comentario,
      canal: dto.canal === 'PORTAL' ? 'PORTAL' : 'EMAIL',
    });
  }
}

/** Pop-up de satisfação do portal do cliente (logado). */
@Controller('popup-satisfacao')
export class PopupSatisfacaoController {
  constructor(private readonly popup: PopupSatisfacaoService) {}

  @Get()
  proximo(@Req() req: Req) {
    return this.popup.proximo(req.user).then((p) => ({ popup: p }));
  }

  @Post('dispensar')
  dispensar(@Req() req: Req, @Body() dto: DispensarPopupDto) {
    return this.popup.dispensar(req.user, dto.tipo, dto.token);
  }
}

/** Administração: NPS por empresa e painel. Só admin. */
@Controller('admin/nps')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class NpsAdminController {
  constructor(private readonly nps: NpsService) {}

  @Get('painel')
  painel(@Query() q: PainelNpsQueryDto) {
    return this.nps.painel(q);
  }

  @Get('empresas/:companyId')
  config(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.nps.config(companyId);
  }

  @Put('empresas/:companyId')
  salvar(
    @Req() req: Req,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: ConfigNpsDto,
  ) {
    return this.nps.salvarConfig(req.user.userId, companyId, dto);
  }
}
