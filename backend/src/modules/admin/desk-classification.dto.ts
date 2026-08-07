import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateDeskClassificationDto {
  @IsUUID()
  specialtyId!: string;

  /** @deprecated Use specialtyId */
  @IsOptional()
  @IsUUID()
  serviceDeskId?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

export class CreateServiceDeskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

/** Alias tipado para o domínio Specialty */
export class CreateSpecialtyDto extends CreateServiceDeskDto {}

export class UpdateServiceDeskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

export class UpdateSpecialtyDto extends UpdateServiceDeskDto {}

export class UpdateDeskClassificationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}
