import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { PermissionModule } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpsertUserCompanyMembershipDto } from './dto/upsert-user-company-membership.dto';
import { AuditMeta } from '../audit/audit.decorator';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission(PermissionModule.USERS, 'canView')
  findAll() {
    return this.usersService.findAll();
  }

  @Get('specialties')
  @RequirePermission(PermissionModule.USERS, 'canView')
  listSpecialties() {
    return this.usersService.listSpecialties();
  }

  /** @deprecated Prefer /users/specialties */
  @Get('service-desks')
  @RequirePermission(PermissionModule.USERS, 'canView')
  listServiceDesks() {
    return this.usersService.listSpecialties();
  }

  @Get(':id')
  @RequirePermission(PermissionModule.USERS, 'canView')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Get(':id/memberships')
  @RequirePermission(PermissionModule.USERS, 'canView')
  listMemberships(@Param('id') id: string) {
    return this.usersService.listCompanyMemberships(id);
  }

  @Put(':id/memberships')
  @RequirePermission(PermissionModule.USERS, 'canEdit')
  @AuditMeta({ entity: 'UserCompany', action: 'UPSERT', entityIdParam: 'id' })
  upsertMembership(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() data: UpsertUserCompanyMembershipDto,
  ) {
    return this.usersService.upsertCompanyMembership(actor, id, data);
  }

  @Delete(':id/memberships/:companyId')
  @RequirePermission(PermissionModule.USERS, 'canEdit')
  @AuditMeta({ entity: 'UserCompany', action: 'DELETE', entityIdParam: 'id' })
  removeMembership(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Param('companyId') companyId: string,
  ) {
    return this.usersService.removeCompanyMembership(actor, id, companyId);
  }

  @Post()
  @RequirePermission(PermissionModule.USERS, 'canCreate')
  @AuditMeta({ entity: 'User', action: 'CREATE' })
  create(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Body() data: CreateUserDto,
  ) {
    return this.usersService.create(actor, data);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.USERS, 'canEdit')
  @AuditMeta({ entity: 'User', action: 'UPDATE', entityIdParam: 'id' })
  update(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() data: UpdateUserDto,
  ) {
    return this.usersService.update(actor, id, data);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.USERS, 'canDelete')
  @AuditMeta({ entity: 'User', action: 'DELETE', entityIdParam: 'id' })
  remove(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id') id: string,
  ) {
    return this.usersService.remove(actor, id);
  }
}
