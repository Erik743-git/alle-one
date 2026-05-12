import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  responsibleName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  zabbixGroupName?: string;

  @IsOptional()
  @IsInt()
  tifluxClientId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  tifluxClientName?: string;

  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
