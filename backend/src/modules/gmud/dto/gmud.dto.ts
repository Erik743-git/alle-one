import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { optionalUuidQuery } from '../../../common/validators/optional-uuid-query.transform';

export enum GmudStatusDto {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  IN_EXECUTION = 'IN_EXECUTION',
  EXECUTED = 'EXECUTED',
  REJECTED = 'REJECTED',
  CANCELED = 'CANCELED',
}

export class UpsertGmudExecutorDto {
  @IsUUID()
  userId!: string;
}

export class UpsertGmudApproverDto {
  @IsUUID()
  userId!: string;
}

export class UpsertGmudActivityDto {
  @IsDateString()
  scheduledAt!: string;

  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @IsUUID()
  executorUserId!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;
}

export class CreateGmudDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsUUID()
  companyId!: string;

  @IsBoolean()
  downtime!: boolean;

  @ValidateIf((o) => o.downtime === true)
  @IsDateString()
  downtimeStart?: string;

  @ValidateIf((o) => o.downtime === true)
  @IsDateString()
  downtimeEnd?: string;

  @IsOptional()
  @IsUUID()
  responsibleId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  impact?: string;

  @IsOptional()
  @IsString()
  rollback?: string;

  @IsArray()
  @ArrayMinSize(1)
  executors!: UpsertGmudExecutorDto[];

  @IsArray()
  @ArrayMinSize(2)
  approvers!: UpsertGmudApproverDto[];

  @IsOptional()
  @IsArray()
  activities?: UpsertGmudActivityDto[];

  @IsOptional()
  @IsBoolean()
  submitForApproval?: boolean;
}

export class UpdateGmudDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsBoolean()
  downtime?: boolean;

  @ValidateIf((o) => o.downtime === true)
  @IsOptional()
  @IsDateString()
  downtimeStart?: string;

  @ValidateIf((o) => o.downtime === true)
  @IsOptional()
  @IsDateString()
  downtimeEnd?: string;

  @IsOptional()
  @IsUUID()
  responsibleId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  impact?: string;

  @IsOptional()
  @IsString()
  rollback?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  executors?: UpsertGmudExecutorDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  approvers?: UpsertGmudApproverDto[];

  @IsOptional()
  @IsArray()
  activities?: UpsertGmudActivityDto[];

  @IsOptional()
  @IsBoolean()
  submitForApproval?: boolean;
}

export class ApproveGmudDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  note?: string;
}

export class ApproveOnBehalfGmudDto {
  @IsUUID()
  onBehalfOfUserId!: string;

  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  note?: string;
}

export class ListGmudsQueryDto {
  @IsOptional()
  @Transform(({ value }) => optionalUuidQuery(value))
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsEnum(GmudStatusDto)
  status?: GmudStatusDto;
}

export class SearchUsersQueryDto {
  @IsOptional()
  @Transform(({ value }) => optionalUuidQuery(value))
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
