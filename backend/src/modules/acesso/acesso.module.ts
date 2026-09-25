import { Global, Module } from '@nestjs/common';
import { AcessoController } from './acesso.controller';
import { MenuController } from './menu.controller';
import { AcessoService } from './acesso.service';

/**
 * Global porque o login (/auth) também lê os módulos desligados. O guard
 * (AcessoModuloGuard) é registrado no AppModule, logo depois do JWT, para
 * rodar já com request.user preenchido.
 */
@Global()
@Module({
  controllers: [AcessoController, MenuController],
  providers: [AcessoService],
  exports: [AcessoService],
})
export class AcessoModule {}
