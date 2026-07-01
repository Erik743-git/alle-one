import {
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
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { multerMemoryLimits } from '../../common/upload.config';
import { AuditMeta } from '../audit/audit.decorator';
import { PermissionModule } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import {
  CreateInventoryAssetDto,
  CreateInventoryAssetTypeDto,
  InventarioAssetIdParamDto,
  InventarioAssetTypeIdParamDto,
  InventarioAttachmentQueryDto,
  InventarioCompanyIdParamDto,
  UpdateInventoryAssetDto,
} from './inventario.dto';
import { InventarioService } from './inventario.service';
import { InventarioImportService } from './inventario-import.service';

@ApiTags('Inventário')
@ApiBearerAuth()
@Controller('inventario')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
export class InventarioController {
  constructor(
    private readonly inventario: InventarioService,
    private readonly inventarioImport: InventarioImportService,
  ) {}

  @Get('asset-types')
  @Roles('ADMIN', 'COLLABORATOR', 'CLIENT')
  @RequirePermission(PermissionModule.INVENTARIO, 'canView')
  listAssetTypes() {
    return this.inventario.listAssetTypes();
  }

  @Post('asset-types')
  @Roles('ADMIN', 'COLLABORATOR')
  @RequirePermission(PermissionModule.INVENTARIO, 'canEdit')
  @AuditMeta({ entity: 'InventoryAssetType', action: 'CREATE' })
  createAssetType(@Body() body: CreateInventoryAssetTypeDto) {
    return this.inventario.createAssetType(body);
  }

  @Get('asset-types/overview')
  @Roles('ADMIN', 'COLLABORATOR', 'CLIENT')
  @RequirePermission(PermissionModule.INVENTARIO, 'canView')
  listAssetTypesOverview(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.inventario.listAssetTypesOverview(user);
  }

  @Get('asset-types/:assetTypeId/assets')
  @Roles('ADMIN', 'COLLABORATOR', 'CLIENT')
  @RequirePermission(PermissionModule.INVENTARIO, 'canView')
  listAssetsByType(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: InventarioAssetTypeIdParamDto,
  ) {
    return this.inventario.listAssetsByType(user, params.assetTypeId);
  }

  @Get('companies')
  @Roles('ADMIN', 'COLLABORATOR', 'CLIENT')
  @RequirePermission(PermissionModule.INVENTARIO, 'canView')
  listCompanies(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.inventario.listCompanies(user);
  }

  @Get('import-template')
  @Roles('ADMIN', 'COLLABORATOR')
  @RequirePermission(PermissionModule.INVENTARIO, 'canEdit')
  async downloadImportTemplate(@Res({ passthrough: true }) res: Response) {
    const buffer = await this.inventarioImport.buildTemplateBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="modelo-importacao-inventario.xlsx"',
    );
    return new StreamableFile(buffer);
  }

  @Get('companies/:companyId/assets')
  @Roles('ADMIN', 'COLLABORATOR', 'CLIENT')
  @RequirePermission(PermissionModule.INVENTARIO, 'canView')
  listAssets(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: InventarioCompanyIdParamDto,
  ) {
    return this.inventario.listAssets(user, params.companyId);
  }

  @Post('companies/:companyId/assets')
  @Roles('ADMIN', 'COLLABORATOR')
  @RequirePermission(PermissionModule.INVENTARIO, 'canEdit')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @AuditMeta({
    entity: 'InventoryAsset',
    action: 'CREATE',
    entityIdParam: 'companyId',
  })
  @UseInterceptors(FileInterceptor('file', multerMemoryLimits))
  createAsset(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: InventarioCompanyIdParamDto,
    @Body() body: CreateInventoryAssetDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.inventario.createAsset(user, params.companyId, body, file);
  }

  @Post('companies/:companyId/assets/import')
  @Roles('ADMIN', 'COLLABORATOR')
  @RequirePermission(PermissionModule.INVENTARIO, 'canEdit')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @AuditMeta({
    entity: 'InventoryAsset',
    action: 'CREATE',
    entityIdParam: 'companyId',
  })
  @UseInterceptors(FileInterceptor('file', multerMemoryLimits))
  importAssets(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: InventarioCompanyIdParamDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie um arquivo Excel (.xlsx).');
    }
    return this.inventarioImport.importFromBuffer({
      user,
      companyId: params.companyId,
      buffer: file.buffer,
    });
  }

  @Patch('assets/:id')
  @Roles('ADMIN', 'COLLABORATOR')
  @RequirePermission(PermissionModule.INVENTARIO, 'canEdit')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @AuditMeta({ entity: 'InventoryAsset', action: 'UPDATE', entityIdParam: 'id' })
  @UseInterceptors(FileInterceptor('file', multerMemoryLimits))
  updateAsset(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: InventarioAssetIdParamDto,
    @Body() body: UpdateInventoryAssetDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.inventario.updateAsset(user, params.id, body, file);
  }

  @Delete('assets/:id')
  @Roles('ADMIN', 'COLLABORATOR')
  @RequirePermission(PermissionModule.INVENTARIO, 'canEdit')
  @AuditMeta({ entity: 'InventoryAsset', action: 'DELETE', entityIdParam: 'id' })
  deleteAsset(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: InventarioAssetIdParamDto,
  ) {
    return this.inventario.deleteAsset(user, params.id);
  }

  @Get('attachments/:fileId')
  @Roles('ADMIN', 'COLLABORATOR', 'CLIENT')
  @RequirePermission(PermissionModule.INVENTARIO, 'canView')
  async downloadAttachment(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('fileId') fileId: string,
    @Query() query: InventarioAttachmentQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, meta } = await this.inventario.downloadAttachment(
      user,
      fileId,
      query.companyId,
      query.inline === 'true',
    );
    res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${meta.inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(meta.originalName)}"`,
    );
    return stream;
  }
}
