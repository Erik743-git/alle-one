import { applyDecorators } from '@nestjs/common';
import { Matches, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 8;

/** Regras alinhadas entre primeiro acesso, reset e senha provisória. */
export function IsStrongPassword() {
  return applyDecorators(
    MinLength(PASSWORD_MIN_LENGTH, {
      message: 'A senha deve ter pelo menos 8 caracteres.',
    }),
    Matches(/[a-z]/, {
      message: 'A senha deve ter pelo menos 1 letra minúscula.',
    }),
    Matches(/[A-Z]/, {
      message: 'A senha deve ter pelo menos 1 letra maiúscula.',
    }),
    Matches(/\d/, { message: 'A senha deve ter pelo menos 1 número.' }),
    Matches(/[^A-Za-z\d]/, {
      message: 'A senha deve ter pelo menos 1 caractere especial.',
    }),
  );
}
