import { Body, Controller, Delete, Get, Put, Req } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsObject, IsString } from 'class-validator';

import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { AcessoService } from './acesso.service';

class PreferenciaMenuDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  ordem!: string[];

  @IsObject()
  visivel!: Record<string, boolean>;
}

type Req = { user: AuthenticatedRequestUser };

/**
 * Personalizar menu: cada pessoa lê e grava só a própria preferência (o id
 * vem da sessão, nunca do corpo). Não muda acesso a nada.
 */
@Controller('me/menu')
export class MenuController {
  constructor(private readonly acesso: AcessoService) {}

  @Get()
  async obter(@Req() req: Req) {
    return {
      preferencia: await this.acesso.preferenciaMenu(req.user.userId),
      emConstrucao: await this.acesso.emConstrucao(),
    };
  }

  @Put()
  salvar(@Req() req: Req, @Body() dto: PreferenciaMenuDto) {
    return this.acesso.salvarPreferenciaMenu(req.user.userId, dto);
  }

  @Delete()
  async limpar(@Req() req: Req) {
    await this.acesso.limparPreferenciaMenu(req.user.userId);
    return { ok: true };
  }
}
