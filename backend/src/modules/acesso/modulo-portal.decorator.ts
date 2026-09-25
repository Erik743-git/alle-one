import { SetMetadata } from '@nestjs/common';

export const MODULO_PORTAL_KEY = 'alleone:moduloPortal';

/**
 * Marca a rota com o módulo da tela Acesso por perfil. O guard global
 * (AcessoModuloGuard) responde 403 quando o módulo está desligado para o
 * perfil de quem chama. Admin sempre passa.
 */
export const ModuloPortal = (chave: string) =>
  SetMetadata(MODULO_PORTAL_KEY, chave);
