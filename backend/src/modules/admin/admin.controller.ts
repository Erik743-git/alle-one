import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionModule } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview-stats')
  @RequirePermission(PermissionModule.ADMIN, 'canView')
  overviewStats() {
    return this.adminService.getOverviewStats();
  }
}
