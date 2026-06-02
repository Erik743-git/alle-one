import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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

  @Get('service-desks')
  @RequirePermission(PermissionModule.USERS, 'canView')
  listServiceDesks() {
    return this.usersService.listServiceDesks();
  }

  @Get(':id')
  @RequirePermission(PermissionModule.USERS, 'canView')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @RequirePermission(PermissionModule.USERS, 'canCreate')
  create(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Body() data: CreateUserDto,
  ) {
    return this.usersService.create(actor, data);
  }

  @Patch(':id')
  @RequirePermission(PermissionModule.USERS, 'canEdit')
  update(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() data: UpdateUserDto,
  ) {
    return this.usersService.update(actor, id, data);
  }

  @Delete(':id')
  @RequirePermission(PermissionModule.USERS, 'canDelete')
  remove(@CurrentUser() actor: AuthenticatedRequestUser, @Param('id') id: string) {
    return this.usersService.remove(actor, id);
  }
}
