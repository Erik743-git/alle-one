import { Global, Module } from '@nestjs/common';
import { AcessoController } from './acesso.controller';
import { AcessoService } from './acesso.service';

/**
 * Global porque o login (/auth) também lê os módulos desligados. O guard
 * (AcessoModuloGuard) é registrado no AppModule, logo depois do JWT, para
 * rodar já com request.user preenchido.
 */
@Global()
@Module({
  controllers: [AcessoController],
  providers: [AcessoService],
  exports: [AcessoService],
})
export class AcessoModule {}
