import { ArrayMaxSize, IsArray, IsString, IsUUID } from 'class-validator';

export class UpdateCompanyTicketSpecialtiesDto {
  @IsArray()
  @IsString({ each: true })
  @IsUUID('4', { each: true })
  @ArrayMaxSize(50)
  specialtyIds!: string[];
}
