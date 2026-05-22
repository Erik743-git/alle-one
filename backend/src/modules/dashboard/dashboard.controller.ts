import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { PermissionModule } from '@prisma/client';
import type { Request } from 'express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { DashboardService } from './dashboard.service';

type AuthenticatedRequest = Request & {
  user: AuthenticatedRequestUser;
};

@Controller('dashboard')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('complete')
  @RequirePermission(PermissionModule.DASHBOARD, 'canView')
  getCompleteDashboard(
    @Req() req: AuthenticatedRequest,
    @Query('group') group?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('companyId') companyId?: string,
    @Query('includeHours') includeHours?: string,
  ) {
    if (!group?.trim()) {
      throw new BadRequestException('O parâmetro "group" é obrigatório.');
    }

    return this.dashboardService.getCompleteDashboard(
      req.user,
      {
        group,
        start,
        end,
        companyId,
      },
      { includeHours: includeHours === 'true' },
    );
  }

  @Get('hours')
  @RequirePermission(PermissionModule.DASHBOARD, 'canView')
  getDashboardHours(
    @Req() req: AuthenticatedRequest,
    @Query('group') group?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('companyId') companyId?: string,
  ) {
    if (!group?.trim()) {
      throw new BadRequestException('O parâmetro "group" é obrigatório.');
    }

    return this.dashboardService.getDashboardHours(req.user, {
      group,
      start,
      end,
      companyId,
    });
  }

  @Get('complete-refresh')
  @RequirePermission(PermissionModule.DASHBOARD, 'canView')
  refreshCompleteDashboard(
    @Req() req: AuthenticatedRequest,
    @Query('group') group?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('companyId') companyId?: string,
  ) {
    if (!group?.trim()) {
      throw new BadRequestException('O parâmetro "group" é obrigatório.');
    }

    return this.dashboardService.refreshCompleteDashboard(req.user, {
      group,
      start,
      end,
      companyId,
    });
  }

  @Get('debug-dump')
  @RequirePermission(PermissionModule.DASHBOARD, 'canView')
  async debugDump(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
    @Query('group') group?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('companyId') companyId?: string,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    if (process.env.ENABLE_DEBUG_DUMP !== 'true') {
      throw new NotFoundException();
    }

    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Apenas administradores podem gerar o dump.',
      );
    }

    if (!group?.trim() && !companyId?.trim()) {
      throw new BadRequestException(
        'Informe "companyId" (ou "group") para gerar o dump.',
      );
    }

    const txt = await this.dashboardService.buildApiDebugDumpTxt(req.user, {
      group: group?.trim() ? group : 'AUTO',
      start,
      end,
      companyId,
    });

    const filename = `debug-dump-${Date.now()}.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return new StreamableFile(Buffer.from(txt, 'utf8'));
  }
}
