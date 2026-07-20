import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class ProjetosCompanyIdParamDto {
  @IsUUID()
  companyId!: string;
}

export class ProjetosProjectIdParamDto {
  @IsUUID()
  projectId!: string;
}

export class ProjetosDocumentIdParamDto {
  @IsUUID()
  projectId!: string;

  @IsUUID()
  documentId!: string;
}

export class ProjetosActivityIdParamDto {
  @IsUUID()
  activityId!: string;
}

export class SearchProjetosUsersQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELED'])
  status?: 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELED';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsIn(['HOURS', 'DAYS'])
  budgetUnit!: 'HOURS' | 'DAYS';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  budgetAmount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  ticketNumber!: number;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELED'])
  status?: 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELED';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['HOURS', 'DAYS'])
  budgetUnit?: 'HOURS' | 'DAYS';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  budgetAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ticketNumber?: number;
}

export class ApproveProjectCompletionDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateProjectPhaseDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateProjectActivityDto {
  @IsUUID()
  parentId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationHours?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualDurationDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualDurationHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string;

  @IsOptional()
  @IsString()
  assigneeName?: string;

  @IsOptional()
  @IsBoolean()
  isMilestone?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @IsUUID(undefined, { each: true })
  predecessorIds!: string[];
}

export class UpdateProjectActivityDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationHours?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualDurationDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualDurationHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsUUID()
  assigneeUserId?: string | null;

  @IsOptional()
  @IsString()
  assigneeName?: string | null;

  @IsOptional()
  @IsBoolean()
  isMilestone?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  predecessorIds?: string[];
}

export class ExportProjectQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  template?: 'true' | 'false';
}

export class CompleteProjectActivityDto {
  @IsBoolean()
  completed!: boolean;
}

export class LinkProjectActivityAppointmentDto {
  @IsUUID()
  portalAppointmentId!: string;
}

export class ProjetosAppointmentLinkIdParamDto {
  @IsUUID()
  linkId!: string;
}
