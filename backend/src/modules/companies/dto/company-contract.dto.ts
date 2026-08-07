import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContractStatus } from '@prisma/client';

export class ContractSpecialtyLineDto {
  @IsUUID()
  specialtyId!: string;

  @IsInt()
  @Min(0)
  @Max(100000)
  monthlyHours!: number;

  @IsOptional()
  @IsBoolean()
  unlimited?: boolean;

  /** Decimal(12,2) em string */
  @IsString()
  contractValue!: string;

  /** Decimal(10,2) em string — valor hora excedente */
  @IsString()
  excessHourPrice!: string;
}

export class CreateCompanyContractDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ContractStatus)
  status: ContractStatus;

  /** @deprecated Prefer specialties[].monthlyHours */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  monthlyHours?: number;

  /** @deprecated Prefer specialties[].excessHourPrice */
  @IsOptional()
  @IsString()
  extraHourPrice?: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsUUID()
  classificationId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractSpecialtyLineDto)
  specialties?: ContractSpecialtyLineDto[];
}

export class UpdateCompanyContractDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  /** @deprecated Prefer specialties[].monthlyHours */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  monthlyHours?: number;

  /** @deprecated Prefer specialties[].excessHourPrice */
  @IsOptional()
  @IsString()
  extraHourPrice?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsUUID()
  classificationId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractSpecialtyLineDto)
  specialties?: ContractSpecialtyLineDto[];
}

export class CompanyContractParamsDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  contractId: string;
}
