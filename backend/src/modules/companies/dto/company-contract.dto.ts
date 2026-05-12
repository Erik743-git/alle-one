import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ContractStatus } from '@prisma/client';

export class CreateCompanyContractDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ContractStatus)
  status: ContractStatus;

  @IsInt()
  @Min(0)
  @Max(100000)
  monthlyHours: number;

  /** Decimal(10,2) em string para evitar problemas de locale */
  @IsString()
  extraHourPrice: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;
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

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  monthlyHours?: number;

  @IsOptional()
  @IsString()
  extraHourPrice?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;
}

export class CompanyContractParamsDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  contractId: string;
}
