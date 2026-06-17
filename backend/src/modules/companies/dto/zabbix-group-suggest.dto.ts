import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SuggestZabbixGroupsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minScore?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  onlyInvalid?: boolean;
}

export class ApplyZabbixGroupSuggestionItemDto {
  @IsUUID()
  companyId!: string;

  @IsString()
  zabbixGroupName!: string;
}

export class ApplyZabbixGroupSuggestionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplyZabbixGroupSuggestionItemDto)
  items!: ApplyZabbixGroupSuggestionItemDto[];
}
