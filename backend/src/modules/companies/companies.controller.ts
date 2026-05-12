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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../gmud/decorators/current-user.decorator';
import type { AuthenticatedRequestUser } from '../gmud/gmud.types';
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
  create(@Body() data: CreateCompanyDto) {
    return this.companiesService.create(data);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.COMPANIES, 'canEdit')
  update(@Param('id') id: string, @Body() data: UpdateCompanyDto) {
    return this.companiesService.update(id, data);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.COMPANIES, 'canDelete')
  remove(@Param('id') id: string) {
    return this.companiesService.remove(id);
  }

  @Get(':id/contracts')
  @RequirePermission(PermissionModule.COMPANIES, 'canView')
  listContracts(@Param('id') companyId: string) {
    return this.companiesService.listContracts(companyId);
  }

  @Post(':id/contracts')
  @RequirePermission(PermissionModule.COMPANIES, 'canEdit')
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
  deleteContract(
    @Param('id') companyId: string,
    @Param('contractId') contractId: string,
  ) {
    return this.companiesService.deleteContract(companyId, contractId);
  }

  @Post(':id/contracts/:contractId/file')
  @RequirePermission(PermissionModule.COMPANIES, 'canEdit')
  @UseInterceptors(FileInterceptor('file'))
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
  @UseInterceptors(FileInterceptor('file'))
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
