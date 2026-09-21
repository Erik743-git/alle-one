import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { PermissionModule } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { GrafanaService } from './grafana.service';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

/**
 * Painéis do Grafana dentro do portal.
 *
 * O portal só diz QUAIS painéis a pessoa vê; quem desenha é o Grafana,
 * direto no navegador. O token da empresa fica no servidor e serve apenas
 * para perguntar ao Grafana o que aquela organização publicou.
 */
@Controller('grafana')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
export class GrafanaController {
  constructor(private readonly grafana: GrafanaService) {}

  @Get('boards')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  listBoards(@Req() req: AuthenticatedRequest) {
    return this.grafana.listBoardsForUser(req.user);
  }
}
