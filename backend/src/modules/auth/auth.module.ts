import { Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthOAuthService } from './auth-oauth.service';
import { AuthService } from './auth.service';
import { TotpService } from './totp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthMailService } from './mail/auth-mail.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    PrismaModule,
    PermissionsModule,
    MailModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET?.trim();
        if (!secret) {
          throw new Error(
            'JWT_SECRET é obrigatório. Defina no .env antes de iniciar a API.',
          );
        }
        const expiresIn = (process.env.JWT_EXPIRES_IN?.trim() ||
          '1d') as JwtSignOptions['expiresIn'];
        return {
          secret,
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthOAuthService,
    JwtStrategy,
    AuthMailService,
    TotpService,
  ],
  exports: [TotpService],
})
export class AuthModule {}
