import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ResponderNpsDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  nota!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comentario?: string;

  @IsOptional()
  @IsIn(['EMAIL', 'PORTAL'])
  canal?: 'EMAIL' | 'PORTAL';
}

export class ConfigNpsDto {
  @IsBoolean()
  ativo!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  intervaloMeses!: number;

  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  destinatarios!: string[];
}

export class DispensarPopupDto {
  @IsIn(['NPS', 'AVALIACAO'])
  tipo!: 'NPS' | 'AVALIACAO';

  @IsString()
  @MaxLength(64)
  token!: string;
}

export class PainelNpsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  de?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  ate?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}
