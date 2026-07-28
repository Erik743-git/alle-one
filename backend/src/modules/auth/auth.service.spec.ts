import { UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';

describe('AuthService.login', () => {
  const prisma = {
    user: {
      findFirst: jest.fn(),
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

  it('autentica com e-mail case-insensitive e inclui tokenVersion no JWT', async () => {
    const hash = await bcrypt.hash('Senha@123', 10);
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      name: 'Maria',
      email: 'maria@empresa.com',
      role: UserRole.CLIENT,
      companyId: 'c1',
      firstAccess: false,
      tokenVersion: 2,
      passwordHash: hash,
      deletedAt: null,
      status: UserStatus.ACTIVE,
      totpEnabledAt: null,
      company: { name: 'Empresa' },
    });

    const session = await service.login({
      email: 'Maria@Empresa.com',
      password: 'Senha@123',
    });

    expect(session.accessToken).toBe('jwt-token');
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'u1',
        tv: 2,
      }),
    );
  });

  it('rejeita senha incorreta', async () => {
    const hash = await bcrypt.hash('Senha@123', 10);
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      passwordHash: hash,
      deletedAt: null,
      status: UserStatus.ACTIVE,
      company: null,
    });

    await expect(
      service.login({ email: 'maria@empresa.com', password: 'errada' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
