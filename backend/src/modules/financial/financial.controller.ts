import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { PermissionModule } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedRequestUser } from '../gmud/gmud.types';
import { FinancialOverviewQueryDto } from './financial.dto';
import { FinancialService } from './financial.service';
import type { Response } from 'express';

@ApiTags('Financial')
@ApiBearerAuth()
@Controller('financial')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
export class FinancialController {
  constructor(private readonly service: FinancialService) {}

  @Get('overview')
  @RequirePermission(PermissionModule.FINANCIAL, 'canView')
  overview(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: FinancialOverviewQueryDto,
  ) {
    return this.service.getOverview(user, query);
  }

  @Get('contracts/:contractId/file')
  @RequirePermission(PermissionModule.FINANCIAL, 'canView')
  async downloadContractFile(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: FinancialOverviewQueryDto,
    @Param('contractId') contractId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, meta } = await this.service.downloadContractFile(
      user,
      query,
      contractId,
    );
    const inline = query.inline === 'true';
    res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(meta.originalName)}"`,
    );
    return file;
  }
}
