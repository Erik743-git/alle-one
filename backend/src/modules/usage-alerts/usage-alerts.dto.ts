import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpsertUsageAlertRuleDto {
  @IsString()
  companyId!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  lowThresholdPct?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  highThresholdPct?: number;

  @IsArray()
  @IsString({ each: true })
  to!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cc?: string[];
}
