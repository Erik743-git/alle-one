import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertDashboardChartPresetDto {
  @IsString()
  @MaxLength(20)
  viewMode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  chartType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deskNames?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  periodDays?: number;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}

export class ChartPresetQueryDto {
  @IsString()
  @MaxLength(20)
  viewMode!: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}
