import {
  Body,
  Controller,
  Get,
  UploadedFile,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PermissionModule } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
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
  create(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateGmudDto,
  ) {
    return this.service.create(user, dto);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.GMUD, 'canEdit')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
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
  @UseInterceptors(FileInterceptor('evidence'))
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
  cancel(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
  ) {
    return this.service.cancel(user, id);
  }

  @Post(':id/attachments')
  @RequirePermission(PermissionModule.GMUD, 'canEdit')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @UseInterceptors(FileInterceptor('file'))
  addAttachment(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.addAttachment(user, id, file);
  }
}
