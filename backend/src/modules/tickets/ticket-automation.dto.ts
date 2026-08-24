import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  TicketAutomationAction,
  TicketAutomationConditions,
  TicketAutomationTrigger,
} from './ticket-automation.types';

export class TicketAutomationConditionsDto implements TicketAutomationConditions {
  @IsOptional()
  @IsInt()
  @Min(1)
  deskExternalId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  clientExternalId?: number | null;

  @IsOptional()
  @IsString()
  classificationId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stageOnEntry?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stageOnExit?: string | null;
}

class TicketAutomationActionDto {
  @IsString()
  @IsIn(['SET_STAGE', 'SET_RESPONSIBLE', 'ADD_APPOINTMENT'])
  type!: TicketAutomationAction['type'];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stageName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  responsibleExternalId?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  notifyClient?: boolean;
}

export class CreateTicketAutomationRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsIn(['STAGE_CHANGE'])
  trigger?: TicketAutomationTrigger;

  @IsObject()
  @ValidateNested()
  @Type(() => TicketAutomationConditionsDto)
  conditions!: TicketAutomationConditionsDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketAutomationActionDto)
  actions!: TicketAutomationActionDto[];

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateTicketAutomationRuleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsIn(['STAGE_CHANGE'])
  trigger?: TicketAutomationTrigger;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TicketAutomationConditionsDto)
  conditions?: TicketAutomationConditionsDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketAutomationActionDto)
  actions?: TicketAutomationActionDto[];

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
