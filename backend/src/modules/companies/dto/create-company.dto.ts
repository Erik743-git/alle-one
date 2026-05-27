import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsString()
  @MaxLength(150)
  responsibleName: string;

  @IsEmail()
  @MaxLength(150)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

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
