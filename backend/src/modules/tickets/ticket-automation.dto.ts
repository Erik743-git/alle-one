import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  TicketAutomationAction,
  TicketAutomationConditions,
  TicketAutomationEmailRecipient,
  TicketAutomationSetFieldName,
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

  @IsOptional()
  @IsInt()
  @Min(1)
  idleMinutes?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  idleStageName?: string | null;
}

class TicketAutomationActionDto {
  @IsString()
  @IsIn([
    'SET_STAGE',
    'SET_RESPONSIBLE',
    'ADD_APPOINTMENT',
    'SET_FIELD',
    'SEND_EMAIL',
    'TRIGGER_WEBHOOK',
  ])
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

  @IsOptional()
  @IsIn([
    'title',
    'stageName',
    'statusName',
    'isClosed',
    'clientId',
    'deskId',
    'responsibleId',
  ])
  field?: TicketAutomationSetFieldName;

  @IsOptional()
  value?: string | number | boolean;

  @IsOptional()
  @IsIn(['REQUESTOR', 'RESPONSIBLE', 'WATCHERS', 'CUSTOM'])
  recipient?: TicketAutomationEmailRecipient;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customTo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  secret?: string | null;
}

const AUTOMATION_TRIGGERS = [
  'STAGE_CHANGE',
  'TICKET_OPENED',
  'TICKET_IDLE',
  'TICKET_NEW_REPLY',
] as const satisfies readonly TicketAutomationTrigger[];

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
  @IsIn(AUTOMATION_TRIGGERS)
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
  @IsIn(AUTOMATION_TRIGGERS)
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
