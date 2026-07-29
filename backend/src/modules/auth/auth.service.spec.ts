jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'SECRET'),
  generateURI: jest.fn(() => 'otpauth://totp/test'),
  verifySync: jest.fn(() => ({ valid: true })),
}));

import { UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';
import { createTotpTrustToken } from './totp-trust-cookie.helper';

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
    assertValidCode: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AuthService(
    prisma as never,
    jwtService as never,
    {} as never,
    permissionsService as never,
    presence as never,
    totp as never,
  );

  const totpEnabledAt = new Date('2026-01-01T00:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    totp.assertValidCode.mockResolvedValue(undefined);
  });

  async function activeUser(overrides: Record<string, unknown> = {}) {
    const hash = await bcrypt.hash('Senha@123', 10);
    return {
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
      totpEnabledAt: null as Date | null,
      company: { name: 'Empresa' },
      ...overrides,
    };
  }

  it('autentica com e-mail case-insensitive e inclui tokenVersion no JWT', async () => {
    prisma.user.findFirst.mockResolvedValue(await activeUser());

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
    prisma.user.findFirst.mockResolvedValue(await activeUser());

    await expect(
      service.login({ email: 'maria@empresa.com', password: 'errada' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('exige 2FA quando totp está ativo e não há trust cookie', async () => {
    prisma.user.findFirst.mockResolvedValue(
      await activeUser({ totpEnabledAt }),
    );

    await expect(
      service.login({ email: 'maria@empresa.com', password: 'Senha@123' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: '2FA_REQUIRED',
        requires2fa: true,
      }),
    });
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('aceita código 2FA e emite sessão', async () => {
    prisma.user.findFirst.mockResolvedValue(
      await activeUser({ totpEnabledAt }),
    );

    const session = await service.login({
      email: 'maria@empresa.com',
      password: 'Senha@123',
      totpCode: '123456',
      rememberDevice: true,
    });

    expect(totp.assertValidCode).toHaveBeenCalledWith('u1', '123456');
    expect(session.accessToken).toBe('jwt-token');
    expect(session.totpTrustToken).toEqual(expect.any(String));
  });

  it('pula 2FA com trust cookie válido', async () => {
    prisma.user.findFirst.mockResolvedValue(
      await activeUser({ totpEnabledAt }),
    );
    const trust = createTotpTrustToken('u1', totpEnabledAt);

    const session = await service.login(
      { email: 'maria@empresa.com', password: 'Senha@123' },
      { trustCookie: trust },
    );

    expect(totp.assertValidCode).not.toHaveBeenCalled();
    expect(session.accessToken).toBe('jwt-token');
    expect(session.totpTrustToken).toEqual(expect.any(String));
  });

  it('completeOAuth2fa valida código e emite sessão', async () => {
    prisma.user.findFirst.mockResolvedValue(
      await activeUser({
        totpEnabledAt,
        role: UserRole.ADMIN,
        companyId: null,
        company: null,
      }),
    );

    const session = await service.completeOAuth2fa('u1', '654321', true);
    expect(totp.assertValidCode).toHaveBeenCalledWith('u1', '654321');
    expect(session.accessToken).toBe('jwt-token');
    expect(session.totpTrustToken).toEqual(expect.any(String));
  });

  it('completeOAuth2fa rejeita usuário sem 2FA ativo', async () => {
    prisma.user.findFirst.mockResolvedValue(
      await activeUser({ totpEnabledAt: null }),
    );
    await expect(
      service.completeOAuth2fa('u1', '654321', false),
    ).rejects.toThrow(UnauthorizedException);
  });
});
