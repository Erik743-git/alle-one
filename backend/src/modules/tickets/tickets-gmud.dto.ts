import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class LinkTicketGmudDto {
  /** ID/referência GMUD do cliente. Envie `null` ou string vazia para remover. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  externalGmudRef?: string | null;
}
