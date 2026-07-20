import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { PermissionModule } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { multerMemoryLimits } from '../../common/upload.config';
import { AuditMeta } from '../audit/audit.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import {
  ApproveProjectCompletionDto,
  CompleteProjectActivityDto,
  CreateProjectActivityDto,
  CreateProjectDto,
  CreateProjectPhaseDto,
  ExportProjectQueryDto,
  LinkProjectActivityAppointmentDto,
  ProjetosAppointmentLinkIdParamDto,
  ProjetosActivityIdParamDto,
  ProjetosCompanyIdParamDto,
  ProjetosDocumentIdParamDto,
  ProjetosProjectIdParamDto,
  SearchProjetosUsersQueryDto,
  UpdateProjectActivityDto,
  UpdateProjectDto,
} from './projetos.dto';
import { ProjetosService } from './projetos.service';

@ApiTags('Projetos')
@ApiBearerAuth()
@Controller('projetos')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
export class ProjetosController {
  constructor(private readonly projetos: ProjetosService) {}

  @Get('companies')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.PROJECTS, 'canView')
  listCompanies(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.projetos.listCompanies(user);
  }

  @Get('users/search')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.PROJECTS, 'canView')
  searchUsers(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: SearchProjetosUsersQueryDto,
  ) {
    return this.projetos.searchUsers(user, query);
  }

  @Get('companies/:companyId/projects')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.PROJECTS, 'canView')
  listProjects(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosCompanyIdParamDto,
  ) {
    return this.projetos.listProjects(user, params.companyId);
  }

  @Post('companies/:companyId/projects')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.PROJECTS, 'canCreate')
  @AuditMeta({ entity: 'Project', action: 'CREATE', entityIdParam: 'companyId' })
  @UseInterceptors(FilesInterceptor('files', 5, multerMemoryLimits))
  async createProject(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosCompanyIdParamDto,
    @Body('payload') payloadRaw: string | undefined,
    @Body() body: CreateProjectDto | undefined,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    let dto: CreateProjectDto;
    if (payloadRaw?.trim()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadRaw);
      } catch {
        throw new BadRequestException('Payload JSON inválido.');
      }
      dto = plainToInstance(CreateProjectDto, parsed);
    } else if (body?.name) {
      dto = plainToInstance(CreateProjectDto, body);
    } else {
      throw new BadRequestException('Dados do projeto são obrigatórios.');
    }

    const errors = await validate(dto);
    if (errors.length > 0) {
      const first = errors[0];
      const msg =
        Object.values(first.constraints ?? {})[0] ?? 'Dados do projeto inválidos.';
      throw new BadRequestException(msg);
    }

    return this.projetos.createProject(user, params.companyId, dto, files ?? []);
  }

  @Get('projects/:projectId')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.PROJECTS, 'canView')
  getProject(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosProjectIdParamDto,
  ) {
    return this.projetos.getProject(user, params.projectId);
  }

  @Patch('projects/:projectId')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.PROJECTS, 'canEdit')
  @AuditMeta({ entity: 'Project', action: 'UPDATE', entityIdParam: 'projectId' })
  updateProject(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosProjectIdParamDto,
    @Body() body: UpdateProjectDto,
  ) {
    return this.projetos.updateProject(user, params.projectId, body);
  }

  @Delete('projects/:projectId')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.PROJECTS, 'canDelete')
  @AuditMeta({ entity: 'Project', action: 'DELETE', entityIdParam: 'projectId' })
  deleteProject(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosProjectIdParamDto,
  ) {
    return this.projetos.deleteProject(user, params.projectId);
  }

  @Post('projects/:projectId/documents')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.PROJECTS, 'canEdit')
  @UseInterceptors(FilesInterceptor('files', 5, multerMemoryLimits))
  addDocuments(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosProjectIdParamDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.projetos.addProjectDocuments(user, params.projectId, files ?? []);
  }

  @Get('projects/:projectId/documents/:documentId')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.PROJECTS, 'canView')
  async downloadDocument(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosDocumentIdParamDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, originalName, mimeType } =
      await this.projetos.downloadProjectDocument(
        user,
        params.projectId,
        params.documentId,
      );
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(originalName)}"`,
    );
    return stream;
  }

  @Post('projects/:projectId/approve-completion')
  @Roles('ADMIN')
  @AuditMeta({ entity: 'Project', action: 'UPDATE', entityIdParam: 'projectId' })
  approveCompletion(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosProjectIdParamDto,
    @Body() body: ApproveProjectCompletionDto,
  ) {
    return this.projetos.approveProjectCompletion(
      user,
      params.projectId,
      body.note,
    );
  }

  @Get('projects/:projectId/ticket-appointments')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.PROJECTS, 'canView')
  listProjectTicketAppointments(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosProjectIdParamDto,
  ) {
    return this.projetos.listProjectTicketAppointments(user, params.projectId);
  }

  @Post('activities/:activityId/appointments/link')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.PROJECTS, 'canEdit')
  @AuditMeta({ entity: 'ProjectActivity', action: 'UPDATE', entityIdParam: 'activityId' })
  linkActivityAppointment(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosActivityIdParamDto,
    @Body() body: LinkProjectActivityAppointmentDto,
  ) {
    return this.projetos.linkActivityAppointment(
      user,
      params.activityId,
      body.portalAppointmentId,
    );
  }

  @Delete('appointments/links/:linkId')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.PROJECTS, 'canEdit')
  @AuditMeta({ entity: 'ProjectActivity', action: 'UPDATE', entityIdParam: 'linkId' })
  unlinkActivityAppointment(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosAppointmentLinkIdParamDto,
  ) {
    return this.projetos.unlinkActivityAppointment(user, params.linkId);
  }

  @Post('projects/:projectId/phases')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.PROJECTS, 'canEdit')
  @AuditMeta({ entity: 'ProjectActivity', action: 'CREATE', entityIdParam: 'projectId' })
  createPhase(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosProjectIdParamDto,
    @Body() body: CreateProjectPhaseDto,
  ) {
    return this.projetos.createPhase(user, params.projectId, body);
  }

  @Get('projects/:projectId/history')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.PROJECTS, 'canView')
  getProjectHistory(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosProjectIdParamDto,
  ) {
    return this.projetos.getProjectHistory(user, params.projectId);
  }

  @Post('projects/:projectId/reopen')
  @Roles('ADMIN')
  @AuditMeta({ entity: 'Project', action: 'UPDATE', entityIdParam: 'projectId' })
  reopenProject(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosProjectIdParamDto,
  ) {
    return this.projetos.reopenProject(user, params.projectId);
  }

  @Post('projects/:projectId/activities')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.PROJECTS, 'canEdit')
  @AuditMeta({ entity: 'ProjectActivity', action: 'CREATE', entityIdParam: 'projectId' })
  createActivity(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosProjectIdParamDto,
    @Body() body: CreateProjectActivityDto,
  ) {
    return this.projetos.createActivity(user, params.projectId, body);
  }

  @Post('activities/:activityId/complete')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.PROJECTS, 'canEdit')
  @AuditMeta({ entity: 'ProjectActivity', action: 'UPDATE', entityIdParam: 'activityId' })
  completeActivity(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosActivityIdParamDto,
    @Body() body: CompleteProjectActivityDto,
  ) {
    return this.projetos.completeActivity(user, params.activityId, body.completed);
  }

  @Patch('activities/:activityId')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.PROJECTS, 'canEdit')
  @AuditMeta({ entity: 'ProjectActivity', action: 'UPDATE', entityIdParam: 'activityId' })
  updateActivity(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosActivityIdParamDto,
    @Body() body: UpdateProjectActivityDto,
  ) {
    return this.projetos.updateActivity(user, params.activityId, body);
  }

  @Delete('activities/:activityId')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.PROJECTS, 'canDelete')
  @AuditMeta({ entity: 'ProjectActivity', action: 'DELETE', entityIdParam: 'activityId' })
  deleteActivity(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosActivityIdParamDto,
  ) {
    return this.projetos.deleteActivity(user, params.activityId);
  }

  @Get('import-template')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.PROJECTS, 'canView')
  async exportImportTemplate(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename, mimeType } =
      await this.projetos.exportImportTemplate(user);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    return new StreamableFile(buffer);
  }

  @Get('projects/:projectId/export')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.PROJECTS, 'canView')
  async exportProject(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosProjectIdParamDto,
    @Query() query: ExportProjectQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const template = query.template === 'true';
    const { buffer, filename, mimeType } = await this.projetos.exportProject(
      user,
      params.projectId,
      template,
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    return new StreamableFile(buffer);
  }

  @Post('projects/:projectId/import')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.PROJECTS, 'canEdit')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @AuditMeta({ entity: 'Project', action: 'UPDATE', entityIdParam: 'projectId' })
  @UseInterceptors(FileInterceptor('file', multerMemoryLimits))
  importProject(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: ProjetosProjectIdParamDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie um arquivo Excel (.xlsx).');
    }
    return this.projetos.importProject(user, params.projectId, file.buffer);
  }
}
