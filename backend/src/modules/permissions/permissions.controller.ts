import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditMeta } from '../audit/audit.decorator';
import { PermissionsService } from './permissions.service';
import { PutUserPermissionsDto } from './permissions.dto';

@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get('users/:userId')
  getForUser(@Param('userId') userId: string) {
    return this.permissionsService.getRawForUser(userId);
  }

  @Put('users/:userId')
  @AuditMeta({
    entity: 'UserPermission',
    action: 'REPLACE',
    entityIdParam: 'userId',
  })
  putForUser(
    @Param('userId') userId: string,
    @Body() body: PutUserPermissionsDto,
  ) {
    return this.permissionsService.replaceUserPermissions(
      userId,
      body.permissions,
    );
  }
}
