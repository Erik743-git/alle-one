import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const HHMM = /^\d{2}:\d{2}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTicketAutoOpenRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY'])
  periodicity!: 'DAILY' | 'WEEKLY' | 'MONTHLY';

  @IsString()
  @Matches(YMD)
  nextScheduledDate!: string;

  @IsString()
  @Matches(HHMM)
  scheduleTime!: string;

  @IsInt()
  @Type(() => Number)
  deskId!: number;

  @IsInt()
  @Type(() => Number)
  clientId!: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  responsibleId?: number | null;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  priorityId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  servicesCatalogsItemId?: number;

  @IsOptional()
  @IsUUID()
  classificationId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(8000)
  description!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  requestorName!: string;

  @IsEmail()
  @MaxLength(255)
  requestorEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  requestorTelephone?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  requestorId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalGmudRef?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  ccEmails?: string[];

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  parentTicketNumber?: number;
}

export class UpdateTicketAutoOpenRuleDto extends CreateTicketAutoOpenRuleDto {}
