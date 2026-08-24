import { Transform, Type } from 'class-transformer';
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
  ValidateIf,
} from 'class-validator';

/** Telefone BR opcional: 10–11 dígitos (com ou sem máscara). */
const BR_PHONE_PATTERN =
  /^(?:\(?\d{2}\)?\s?)?(?:9\d{4}|\d{4})-?\d{4}$|^\d{10,11}$/;

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
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Type(() => Number)
  responsibleId?: number | null;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  requestorId?: number;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  requestorName!: string;

  @IsEmail()
  @MaxLength(255)
  requestorEmail!: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && !value.trim() ? undefined : value,
  )
  @IsString()
  @MaxLength(50)
  @Matches(BR_PHONE_PATTERN, {
    message: 'Telefone inválido. Use DDD + número (10 ou 11 dígitos).',
  })
  requestorTelephone?: string;

  /** Referência GMUD (código da lista do cliente ou texto legado). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  externalGmudRef?: string;

  /** E-mails em cópia nas notificações do chamado. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  ccEmails?: string[];
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

  /** Fim no dia seguinte (YYYY-MM-DD). Só aceita o mesmo dia ou D+1. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

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

  /** Envia e-mail ao responsável e aos seguidores. */
  @IsOptional()
  @IsBoolean()
  notifyClient?: boolean;

  /** Advertência: exige leitura dos demais usuários ao abrir o chamado. */
  @IsOptional()
  @IsBoolean()
  isWarning?: boolean;
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

  /** Troca de cliente (tiflux client id). Só ADMIN no service. */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  clientId?: number;

  /** Troca de mesa/fila (external id). */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  deskId?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removeAttachmentFileIds?: string[];
}

export class AcknowledgeAppointmentWarningDto {
  /** Quando true, não exibir novamente e registrar no histórico. */
  @IsBoolean()
  permanent!: boolean;
}
