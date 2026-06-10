import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
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

  /** Remote, External ou Internal. */
  @IsIn(['Remote', 'External', 'Internal'])
  attendance!: 'Remote' | 'External' | 'Internal';
}
