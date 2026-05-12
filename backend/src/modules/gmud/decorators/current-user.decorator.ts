import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequestUser } from '../gmud.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedRequestUser => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedRequestUser }>();
    return req.user as AuthenticatedRequestUser;
  },
);
