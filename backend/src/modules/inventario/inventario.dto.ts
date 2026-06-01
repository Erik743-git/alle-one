import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class InventarioCompanyIdParamDto {
  @IsUUID()
  companyId!: string;
}

export class InventarioAssetIdParamDto {
  @IsUUID()
  id!: string;
}

export class CreateInventoryAssetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  unit?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class UpdateInventoryAssetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  unit?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  /** Envie string vazia para remover a data de vencimento. */
  @IsOptional()
  clearDueDate?: string;

  /** Envie "true" para remover o anexo atual. */
  @IsOptional()
  removeAttachment?: string;
}

export class InventarioAttachmentQueryDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  inline?: string;
}
