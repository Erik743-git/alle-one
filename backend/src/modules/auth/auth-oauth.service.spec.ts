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

  const service = new AuthService(
    prisma as never,
    jwtService as never,
    {} as never,
    permissionsService as never,
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
    });
    prisma.user.update.mockResolvedValue({});

    const session = await service.loginWithOAuth({
      provider: 'google',
      providerId: 'gid-1',
      email: 'maria@empresa.com',
      emailVerified: true,
    });

    expect(session.accessToken).toBe('jwt-token');
    expect(session.user.email).toBe('maria@empresa.com');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { googleId: 'gid-1', provider: 'google' },
    });
  });
});
