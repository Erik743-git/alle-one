import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ConsoleAlertsQueryDto {
  @IsOptional()
  @IsString()
  group?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsIn(['yes', 'no', 'all'])
  ack?: 'yes' | 'no' | 'all';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @IsIn(['true', 'false'])
  priorityOnly?: 'true' | 'false';
}

export class ConsoleHostsQueryDto {
  @IsOptional()
  @IsString()
  group?: string;

  @IsOptional()
  @IsIn(['all', 'enabled', 'disabled'])
  status?: 'all' | 'enabled' | 'disabled';

  @IsOptional()
  @IsString()
  search?: string;
}

export class ConsoleHostItemsQueryDto {
  @IsOptional()
  @IsString()
  group?: string;
}

export class ConsoleHostIdParamDto {
  @IsString()
  @MinLength(1)
  hostid!: string;
}

export class ConsoleEventIdParamDto {
  @IsString()
  @MinLength(1)
  eventid!: string;
}

export class ConsoleAcknowledgeDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  group?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  close?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  suppress?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  severity?: number;
}
