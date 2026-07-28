import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(8000)
  description!: string;

  @IsInt()
  @Type(() => Number)
  clientId!: number;

  @IsInt()
  @Type(() => Number)
  deskId!: number;

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

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  responsibleId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  requestorId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  requestorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  requestorEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  requestorTelephone?: string;

  /** Referência GMUD externa informada pelo cliente. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  externalGmudRef?: string;
}

export class CreateTicketAppointmentDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  initTime!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(8000)
  description!: string;

  /** Tipo de atendimento: HORA NORMAL, HORA EXTRA ou PLANTÃO. */
  @IsString()
  @IsIn(['HORA NORMAL', 'HORA EXTRA', 'PLANTÃO', 'Plantão'])
  serviceName!: string;

  /** Atividade do projeto vinculado ao ticket (opcional). */
  @IsOptional()
  @IsUUID()
  projectActivityId?: string;

  /** Remote, External ou Internal. */
  @IsIn(['Remote', 'External', 'Internal'])
  attendance!: 'Remote' | 'External' | 'Internal';
}

export class UpdateTicketAppointmentDto extends CreateTicketAppointmentDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removeAttachmentFileIds?: string[];
}

/** Edição de campos do ticket no portal (e opcionalmente TiFlux). */
export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50_000)
  description?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Type(() => Number)
  responsibleId?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(255)
  responsibleName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stageName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  statusName?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isClosed?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removeAttachmentFileIds?: string[];
}
