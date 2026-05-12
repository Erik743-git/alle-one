import { SetMetadata } from '@nestjs/common';
import type { AuthenticatedRequestUser } from '../auth-request-user';

export const ROLES_KEY = 'roles';
export type AppRole = AuthenticatedRequestUser['role'];

export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);
