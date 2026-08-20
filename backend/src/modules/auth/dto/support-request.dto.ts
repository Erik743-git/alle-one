import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SupportRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  empresa!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  mensagem!: string;
}
