import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PermissionModule } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RendimentoTimesheetQueryDto } from './rendimento.dto';
import { RendimentoService } from './rendimento.service';

@ApiTags('Rendimento')
@ApiBearerAuth()
@Controller('rendimento')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN', 'COLLABORATOR')
export class RendimentoController {
  constructor(private readonly rendimentoService: RendimentoService) {}

  @Get('collaborators')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canView')
  listCollaborators() {
    return this.rendimentoService.listCollaborators();
  }

  @Get('users/:userId/timesheet')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canView')
  getTimesheet(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: RendimentoTimesheetQueryDto,
  ) {
    return this.rendimentoService.getTimesheet({
      userId,
      view: query.view,
      date: query.date,
    });
  }
}
