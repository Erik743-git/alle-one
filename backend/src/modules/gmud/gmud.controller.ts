import {
  Body,
  Controller,
  Get,
  UploadedFile,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { PermissionModule } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { multerMemoryLimits } from '../../common/upload.config';
import { AuditMeta } from '../audit/audit.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ApproveGmudDto,
  ApproveOnBehalfGmudDto,
  CreateGmudDto,
  ListGmudsQueryDto,
  SearchUsersQueryDto,
  UpdateGmudDto,
} from './dto/gmud.dto';
import { GmudService } from './gmud.service';
import type { AuthenticatedRequestUser } from './gmud.types';

@ApiTags('GMUD')
@ApiBearerAuth()
@Controller('gmuds')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
export class GmudController {
  constructor(private readonly service: GmudService) {}

  @Get()
  @RequirePermission(PermissionModule.GMUD, 'canView')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  list(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: ListGmudsQueryDto,
  ) {
    return this.service.list(user, query);
  }

  @Get('users/search')
  @RequirePermission(PermissionModule.GMUD, 'canView')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  searchUsers(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: SearchUsersQueryDto,
  ) {
    return this.service.searchUsers(user, query);
  }

  @Get('companies')
  @RequirePermission(PermissionModule.GMUD, 'canView')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  listCompanies(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.service.listCompanies(user);
  }

  @Get(':id/pdf')
  @RequirePermission(PermissionModule.GMUD, 'canView')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  async exportPdf(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.service.exportPdf(user, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @RequirePermission(PermissionModule.GMUD, 'canView')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  getById(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
  ) {
    return this.service.getById(user, id);
  }

  @Post()
  @RequirePermission(PermissionModule.GMUD, 'canCreate')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @AuditMeta({ entity: 'Gmud', action: 'CREATE' })
  create(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateGmudDto,
  ) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.GMUD, 'canEdit')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @AuditMeta({ entity: 'Gmud', action: 'UPDATE', entityIdParam: 'id' })
  update(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateGmudDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Post(':id/approve')
  @RequirePermission(PermissionModule.GMUD, 'canApprove')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @AuditMeta({ entity: 'Gmud', action: 'APPROVE', entityIdParam: 'id' })
  approve(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: ApproveGmudDto,
  ) {
    return this.service.approve(user, id, dto);
  }

  @Post(':id/approve-on-behalf')
  @RequirePermission(PermissionModule.GMUD, 'canApprove')
  @Roles('ADMIN')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @AuditMeta({
    entity: 'Gmud',
    action: 'APPROVE_ON_BEHALF',
    entityIdParam: 'id',
  })
  @UseInterceptors(FileInterceptor('evidence', multerMemoryLimits))
  approveOnBehalf(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: ApproveOnBehalfGmudDto,
    @UploadedFile() evidence?: Express.Multer.File,
  ) {
    return this.service.approveOnBehalf(user, id, dto, evidence);
  }

  @Post(':id/execution/start')
  @RequirePermission(PermissionModule.GMUD, 'canEdit')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  startExecution(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
  ) {
    return this.service.startExecution(user, id);
  }

  @Post(':id/execution/complete')
  @RequirePermission(PermissionModule.GMUD, 'canEdit')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  completeExecution(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
  ) {
    return this.service.completeExecution(user, id);
  }

  @Post(':id/cancel')
  @RequirePermission(PermissionModule.GMUD, 'canEdit')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @AuditMeta({ entity: 'Gmud', action: 'CANCEL', entityIdParam: 'id' })
  cancel(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
  ) {
    return this.service.cancel(user, id);
  }

  @Post(':id/attachments')
  @RequirePermission(PermissionModule.GMUD, 'canEdit')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @AuditMeta({
    entity: 'GmudAttachment',
    action: 'CREATE',
    entityIdParam: 'id',
  })
  @UseInterceptors(FileInterceptor('file', multerMemoryLimits))
  addAttachment(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.addAttachment(user, id, file);
  }

  @Get(':id/attachments/:attachmentId')
  @RequirePermission(PermissionModule.GMUD, 'canView')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  async downloadAttachment(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.service.downloadAttachment(user, id, attachmentId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.originalName)}"`,
    );
    return new StreamableFile(file.stream);
  }
}
