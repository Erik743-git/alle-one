import { UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PermissionsService } from './permissions.service';

describe('PermissionsService.buildRequestUser', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const service = new PermissionsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejeita usuário com deletedAt', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'x@y.com',
      role: 'COLLABORATOR',
      companyId: null,
      status: UserStatus.ACTIVE,
      deletedAt: new Date(),
      permissions: [],
    });

    await expect(service.buildRequestUser('u1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('aceita usuário ativo sem deletedAt', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u2',
      email: 'a@b.com',
      role: 'ADMIN',
      companyId: null,
      status: UserStatus.ACTIVE,
      deletedAt: null,
      permissions: [],
    });

    const user = await service.buildRequestUser('u2');
    expect(user.userId).toBe('u2');
    expect(user.role).toBe('ADMIN');
  });
});
