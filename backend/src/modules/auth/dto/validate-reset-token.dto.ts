import { IsString, MaxLength, MinLength } from 'class-validator';

export class ValidateResetTokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  token: string;
}
