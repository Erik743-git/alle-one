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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  InventarioAssetIdParamDto,
  InventarioAttachmentQueryDto,
  InventarioCompanyIdParamDto,
  UpdateInventoryAssetDto,
} from './inventario.dto';
import { InventarioService } from './inventario.service';

@ApiTags('Inventário')
@ApiBearerAuth()
@Controller('inventario')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN', 'COLLABORATOR')
export class InventarioController {
  constructor(private readonly inventario: InventarioService) {}

  @Get('companies')
  @RequirePermission(PermissionModule.INVENTARIO, 'canView')
  listCompanies(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.inventario.listCompanies(user);
  }

  @Get('companies/:companyId/assets')
  @RequirePermission(PermissionModule.INVENTARIO, 'canView')
  listAssets(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: InventarioCompanyIdParamDto,
  ) {
    return this.inventario.listAssets(user, params.companyId);
  }

  @Post('companies/:companyId/assets')
  @RequirePermission(PermissionModule.INVENTARIO, 'canEdit')
  @UseInterceptors(FileInterceptor('file'))
  createAsset(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: InventarioCompanyIdParamDto,
    @Body() body: CreateInventoryAssetDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.inventario.createAsset(user, params.companyId, body, file);
  }

  @Patch('assets/:id')
  @RequirePermission(PermissionModule.INVENTARIO, 'canEdit')
  @UseInterceptors(FileInterceptor('file'))
  updateAsset(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: InventarioAssetIdParamDto,
    @Body() body: UpdateInventoryAssetDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.inventario.updateAsset(user, params.id, body, file);
  }

  @Delete('assets/:id')
  @RequirePermission(PermissionModule.INVENTARIO, 'canEdit')
  deleteAsset(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param() params: InventarioAssetIdParamDto,
  ) {
    return this.inventario.deleteAsset(user, params.id);
  }

  @Get('attachments/:fileId')
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
