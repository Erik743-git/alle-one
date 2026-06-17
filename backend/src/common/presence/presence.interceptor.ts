import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { AuthenticatedRequestUser } from '../../modules/auth/auth-request-user';
import { PresenceService } from './presence.service';

@Injectable()
export class PresenceInterceptor implements NestInterceptor {
  constructor(private readonly presence: PresenceService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedRequestUser;
    }>();

    if (request.user?.userId) {
      this.presence.touch(request.user.userId);
    }

    return next.handle();
  }
}
