import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PermissionModule } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { MailboxService } from './mailbox.service';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@ApiTags('Correio')
@ApiBearerAuth()
@Controller('mailbox')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN', 'COLLABORATOR', 'PJ')
export class MailboxController {
  constructor(private readonly mailbox: MailboxService) {}

  @Get()
  @RequirePermission(PermissionModule.CORREIO, 'canView')
  list(@Req() req: AuthenticatedRequest) {
    return this.mailbox.list(req.user);
  }

  @Get('unread-count')
  @RequirePermission(PermissionModule.CORREIO, 'canView')
  unreadCount(@Req() req: AuthenticatedRequest) {
    return this.mailbox.unreadCount(req.user).then((count) => ({ count }));
  }

  @Post('refresh')
  @RequirePermission(PermissionModule.CORREIO, 'canView')
  refresh(@Req() req: AuthenticatedRequest) {
    return this.mailbox.refreshForUser(req.user).then(() => ({ ok: true }));
  }

  @Patch('read-all')
  @RequirePermission(PermissionModule.CORREIO, 'canView')
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.mailbox.markAllRead(req.user);
  }

  @Patch(':id/read')
  @RequirePermission(PermissionModule.CORREIO, 'canView')
  markRead(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.mailbox.markRead(req.user, id);
  }
}
