import { IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  token: string;

  @IsString()
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres.' })
  @Matches(/[a-z]/, {
    message: 'A senha deve ter pelo menos 1 letra minúscula.',
  })
  @Matches(/[A-Z]/, {
    message: 'A senha deve ter pelo menos 1 letra maiúscula.',
  })
  @Matches(/\d/, { message: 'A senha deve ter pelo menos 1 número.' })
  @Matches(/[^A-Za-z\d]/, {
    message: 'A senha deve ter pelo menos 1 caractere especial.',
  })
  newPassword: string;
}
