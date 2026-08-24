import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const TICKET_LIST_PRESET_COLORS = [
  '#f97316',
  '#14b8a6',
  '#38bdf8',
  '#0d9488',
  '#0891b2',
  '#ea580c',
  '#fdba74',
  '#22c55e',
  '#ef4444',
] as const;

export const TICKET_LIST_GROUP_BY = [
  'none',
  'stage',
  'client',
  'responsible',
] as const;

export const TICKET_LIST_COLUMN_KEYS = [
  'number',
  'title',
  'client',
  'gmud',
  'origin',
  'priority',
  'stage',
  'responsible',
  'updated',
] as const;

export const TICKET_LIST_FILTER_FIELDS = [
  'mineOnly',
  'includeDone',
  'search',
  'ticketNumber',
  'externalGmudRef',
  'stageName',
  'clientExternalId',
  'responsibleExternalId',
  'deskName',
  'from',
  'to',
  'unassigned',
] as const;

export class TicketListPresetFilterRuleDto {
  @IsString()
  @IsIn([...TICKET_LIST_FILTER_FIELDS])
  field!: (typeof TICKET_LIST_FILTER_FIELDS)[number];

  @IsString()
  @MaxLength(500)
  value!: string;
}

export class TicketListPresetConfigDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketListPresetFilterRuleDto)
  @ArrayMaxSize(20)
  rules?: TicketListPresetFilterRuleDto[];

  @IsOptional()
  @IsString()
  @IsIn([...TICKET_LIST_GROUP_BY])
  groupBy?: (typeof TICKET_LIST_GROUP_BY)[number];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  visibleColumns?: string[];

  @IsOptional()
  @IsObject()
  columnFilters?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  sortKey?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc' | null;
}

export class CreateTicketListPresetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ValidateNested()
  @Type(() => TicketListPresetConfigDto)
  config!: TicketListPresetConfigDto;
}

export class UpdateTicketListPresetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TicketListPresetConfigDto)
  config?: TicketListPresetConfigDto;
}
