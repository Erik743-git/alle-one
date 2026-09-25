import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const ESTAGIOS = [
  'PENDENTE',
  'EM_ANALISE',
  'PROPOSTA',
  'AGUARDO_CLIENTE',
  'APROVADO',
  'REPROVADO',
  'FECHADO',
] as const;
const TIPOS = ['PRODUTO', 'CONTRATO', 'SERVICO_AVULSO', 'PROSPECCAO'] as const;
const MOTIVOS = ['PRECO', 'CONCORRENTE', 'DESISTENCIA', 'OUTRO'] as const;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const lista = ({ value }: { value: unknown }) =>
  value === undefined || value === ''
    ? undefined
    : Array.isArray(value)
      ? value
      : String(value).split(',').filter(Boolean);

export class QuadroQueryDto {
  @IsOptional() @IsString() responsavelId?: string;
  @IsOptional() @IsString() @Length(0, 200) solicitante?: string;
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional()
  @Transform(lista)
  @IsArray()
  @ArrayMaxSize(7)
  @IsIn(ESTAGIOS, { each: true })
  estagios?: (typeof ESTAGIOS)[number][];
  @IsOptional() @IsIn(TIPOS) tipo?: (typeof TIPOS)[number];
  @IsOptional() @Matches(YMD) de?: string;
  @IsOptional() @Matches(YMD) ate?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  incluirFechados?: boolean;
  @IsOptional() @IsString() @Length(0, 200) busca?: string;
}

export class PeriodoQueryDto {
  @IsOptional() @Matches(YMD) de?: string;
  @IsOptional() @Matches(YMD) ate?: string;
}

export class CriarOportunidadeDto {
  @IsString() @Length(1, 200) titulo!: string;
  @IsOptional() @IsString() @Length(0, 20000) descricao?: string;
}

export class EditarOportunidadeDto {
  @IsOptional() @IsString() @Length(1, 200) titulo?: string;
  @IsOptional() @IsString() @Length(0, 20000) descricao?: string;
  @IsOptional() @IsIn([...TIPOS, null]) tipo?: (typeof TIPOS)[number] | null;
  @IsOptional() @IsUUID() solicitanteUserId?: string | null;
  @IsOptional() @IsString() @Length(1, 200) solicitanteNome?: string;
  @IsOptional() @IsEmail() solicitanteEmail?: string | null;
  @IsOptional() @IsUUID() companyId?: string | null;
  @IsOptional() @IsString() @Length(0, 200) clienteNome?: string | null;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999_999)
  valorEstimado?: number | null;
  @IsOptional() @Matches(YMD) dataRetorno?: string | null;
  @IsOptional() @IsUUID() responsavelUserId?: string | null;
}

export class MoverOportunidadeDto {
  @IsIn(ESTAGIOS) para!: (typeof ESTAGIOS)[number];
  @IsOptional() @IsIn(TIPOS) tipo?: (typeof TIPOS)[number];
  @IsOptional() @IsIn(MOTIVOS) motivoReprova?: (typeof MOTIVOS)[number];
  @IsOptional() @IsString() @Length(0, 500) motivoReprovaTexto?: string;
}

export class ConfigOportunidadesDto {
  @IsOptional() @IsString() @Length(0, 255) caixaEmail?: string | null;
  @IsOptional() @IsBoolean() leituraAtiva?: boolean;
  @IsOptional() @IsBoolean() avisarSolicitanteExterno?: boolean;
}

export class ConverterOportunidadeDto {
  @IsIn(['CHAMADO', 'PROJETO']) destino!: 'CHAMADO' | 'PROJETO';
  /** Chamado: mesa (id da mesa, o mesmo da abertura de chamado). */
  @IsOptional() @IsInt() @Min(1) deskId?: number;
  /** Projeto: orçamento em horas ou dias. */
  @IsOptional() @IsIn(['HOURS', 'DAYS']) budgetUnit?: 'HOURS' | 'DAYS';
  @IsOptional() @IsInt() @Min(1) @Max(100000) budgetAmount?: number;
  /** Projeto: chamado ao qual ele fica ligado (padrão: o gerado pela oportunidade). */
  @IsOptional() @IsInt() @Min(1) ticketNumber?: number;
}
