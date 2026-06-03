import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PermissionModule } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { multerMemoryLimits } from '../../common/upload.config';
import { AuditMeta } from '../audit/audit.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedRequestUser } from '../gmud/gmud.types';
import type { AuthenticatedRequestUser as AuthUser } from '../auth/auth-request-user';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import {
  CreateCompanyContractDto,
  UpdateCompanyContractDto,
} from './dto/company-contract.dto';
import type { Response } from 'express';

@Controller('companies')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @RequirePermission(PermissionModule.COMPANIES, 'canView')
  findAll() {
    return this.companiesService.findAll();
  }

  @Get(':id')
  @RequirePermission(PermissionModule.COMPANIES, 'canView')
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Post()
  @RequirePermission(PermissionModule.COMPANIES, 'canCreate')
  @AuditMeta({ entity: 'Company', action: 'CREATE' })
  create(@CurrentUser() actor: AuthUser, @Body() data: CreateCompanyDto) {
    return this.companiesService.create(actor, data);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.COMPANIES, 'canEdit')
  @AuditMeta({ entity: 'Company', action: 'UPDATE', entityIdParam: 'id' })
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() data: UpdateCompanyDto,
  ) {
    return this.companiesService.update(actor, id, data);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.COMPANIES, 'canDelete')
  @AuditMeta({ entity: 'Company', action: 'DELETE', entityIdParam: 'id' })
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.companiesService.remove(actor, id);
  }

  @Get(':id/contracts')
  @RequirePermission(PermissionModule.COMPANIES, 'canView')
  listContracts(@Param('id') companyId: string) {
    return this.companiesService.listContracts(companyId);
  }

  @Post(':id/contracts')
  @RequirePermission(PermissionModule.COMPANIES, 'canEdit')
  @AuditMeta({
    entity: 'CompanyContract',
    action: 'CREATE',
    entityIdParam: 'id',
  })
  createContract(
    @Param('id') companyId: string,
    @Body() dto: CreateCompanyContractDto,
  ) {
    return this.companiesService.createContract(companyId, dto);
  }

  @Patch(':id/contracts/:contractId')
  @RequirePermission(PermissionModule.COMPANIES, 'canEdit')
  updateContract(
    @Param('id') companyId: string,
    @Param('contractId') contractId: string,
    @Body() dto: UpdateCompanyContractDto,
  ) {
    return this.companiesService.updateContract(companyId, contractId, dto);
  }

  @Delete(':id/contracts/:contractId')
  @RequirePermission(PermissionModule.COMPANIES, 'canDelete')
  @AuditMeta({
    entity: 'CompanyContract',
    action: 'DELETE',
    entityIdParam: 'contractId',
  })
  deleteContract(
    @Param('id') companyId: string,
    @Param('contractId') contractId: string,
  ) {
    return this.companiesService.deleteContract(companyId, contractId);
  }

  @Post(':id/contracts/:contractId/file')
  @RequirePermission(PermissionModule.COMPANIES, 'canEdit')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @AuditMeta({
    entity: 'CompanyContract',
    action: 'UPLOAD_FILE',
    entityIdParam: 'contractId',
  })
  @UseInterceptors(FileInterceptor('file', multerMemoryLimits))
  uploadContractFile(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') companyId: string,
    @Param('contractId') contractId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.companiesService.uploadContractFile(
      user,
      companyId,
      contractId,
      file,
    );
  }

  @Post(':id/logo')
  @RequirePermission(PermissionModule.COMPANIES, 'canEdit')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @AuditMeta({ entity: 'Company', action: 'UPLOAD_LOGO', entityIdParam: 'id' })
  @UseInterceptors(FileInterceptor('file', multerMemoryLimits))
  uploadLogo(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') companyId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.companiesService.uploadLogo(user, companyId, file);
  }

  @Get(':id/logo')
  @RequirePermission(PermissionModule.COMPANIES, 'canView')
  async getLogo(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') companyId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, meta } = await this.companiesService.downloadLogo(
      user,
      companyId,
    );
    res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(meta.originalName)}"`,
    );
    return file;
  }

  @Delete(':id/logo')
  @RequirePermission(PermissionModule.COMPANIES, 'canEdit')
  removeLogo(@Param('id') companyId: string) {
    return this.companiesService.removeLogo(companyId);
  }
}
