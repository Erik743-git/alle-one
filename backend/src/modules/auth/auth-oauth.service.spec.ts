jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'SECRET'),
  generateURI: jest.fn(() => 'otpauth://totp/test'),
  verifySync: jest.fn(() => ({ valid: true })),
}));

import { UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AuthService } from './auth.service';

describe('AuthService.loginWithOAuth', () => {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('jwt-token'),
  };

  const permissionsService = {
    buildRequestUser: jest.fn().mockResolvedValue({
      userId: 'u1',
      permissions: [],
    }),
  };

  const presence = {
    touch: jest.fn(),
  };

  const totp = {
    assertValidCode: jest.fn(),
  };

  const service = new AuthService(
    prisma as never,
    jwtService as never,
    {} as never,
    permissionsService as never,
    presence as never,
    totp as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejeita e-mail não cadastrado', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.loginWithOAuth({
        provider: 'google',
        providerId: 'gid-1',
        email: 'novo@empresa.com',
        emailVerified: true,
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('autentica usuário cadastrado e vincula googleId', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      name: 'Maria',
      email: 'maria@empresa.com',
      role: UserRole.ADMIN,
      companyId: null,
      firstAccess: false,
      googleId: null,
      microsoftId: null,
      company: null,
      status: UserStatus.ACTIVE,
      totpEnabledAt: null,
    });
    prisma.user.update.mockResolvedValue({});

    const session = await service.loginWithOAuth({
      provider: 'google',
      providerId: 'gid-1',
      email: 'maria@empresa.com',
      emailVerified: true,
    });

    expect(session.status).toBe('authenticated');
    if (session.status !== 'authenticated') return;
    expect(session.accessToken).toBe('jwt-token');
    expect(session.user.email).toBe('maria@empresa.com');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { googleId: 'gid-1', provider: 'google' },
    });
  });

  it('exige 2FA quando totp está ativo e dispositivo não é confiável', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      name: 'Maria',
      email: 'maria@empresa.com',
      role: UserRole.ADMIN,
      companyId: null,
      firstAccess: false,
      googleId: 'gid-1',
      microsoftId: null,
      company: null,
      status: UserStatus.ACTIVE,
      totpEnabledAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.loginWithOAuth({
      provider: 'google',
      providerId: 'gid-1',
      email: 'maria@empresa.com',
      emailVerified: true,
    });

    expect(result).toEqual({
      status: '2fa_required',
      userId: 'u1',
      trustDays: expect.any(Number),
    });
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
});
