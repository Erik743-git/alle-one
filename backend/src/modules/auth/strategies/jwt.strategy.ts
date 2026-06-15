import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ACCESS_TOKEN_COOKIE } from '../auth.constants';
import { PermissionsService } from '../../permissions/permissions.service';

type JwtPayload = {
  sub: string;
  tv?: number;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly permissionsService: PermissionsService) {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error('JWT_SECRET não foi definido no .env');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const v = req?.cookies?.[ACCESS_TOKEN_COOKIE];
          return typeof v === 'string' ? v : null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload) {
    return this.permissionsService.buildRequestUser(payload.sub, payload.tv);
  }
}
