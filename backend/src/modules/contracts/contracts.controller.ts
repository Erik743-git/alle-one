import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PermissionModule } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../gmud/decorators/current-user.decorator';
import type { AuthenticatedRequestUser } from '../gmud/gmud.types';
import { ListContractsQueryDto } from './contracts.dto';
import { ContractsService } from './contracts.service';

@ApiTags('Contracts')
@ApiBearerAuth()
@Controller('contracts')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get()
  @RequirePermission(PermissionModule.FINANCIAL, 'canView')
  list(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: ListContractsQueryDto,
  ) {
    return this.service.list(user, query);
  }
}
