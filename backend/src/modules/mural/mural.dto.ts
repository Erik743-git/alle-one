import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

import { MURAL_CORES, MURAL_REACOES } from './mural.service';

export class CreateMuralNoteDto {
  @IsString()
  @Length(1, 600)
  message!: string;

  @IsOptional()
  @IsIn(MURAL_CORES as unknown as string[])
  color?: string;

  /** Para quem é. Ausente = recado para o mural inteiro. */
  @IsOptional()
  @IsUUID()
  toUserId?: string;

  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  x?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  y?: number;

  @IsOptional()
  @IsNumber()
  @Min(-10)
  @Max(10)
  rotation?: number;
}

export class UpdateMuralNoteDto {
  @IsOptional()
  @IsString()
  @Length(1, 600)
  message?: string;

  @IsOptional()
  @IsIn(MURAL_CORES as unknown as string[])
  color?: string;

  /** String vazia tira o destinatário e devolve o bilhete ao mural. */
  @IsOptional()
  @IsString()
  toUserId?: string;

  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  x?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  y?: number;

  @IsOptional()
  @IsNumber()
  @Min(-10)
  @Max(10)
  rotation?: number;
}

export class ReagirMuralNoteDto {
  @IsIn(MURAL_REACOES as unknown as string[])
  emoji!: string;
}
