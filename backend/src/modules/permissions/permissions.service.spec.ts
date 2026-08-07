import { UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { PermissionsService } from './permissions.service';

describe('PermissionsService.buildRequestUser', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const service = new PermissionsService(prisma as never);

  it('rejeita JWT com tokenVersion desatualizado', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      role: UserRole.CLIENT,
      companyId: null,
      deletedAt: null,
      status: UserStatus.ACTIVE,
      tokenVersion: 3,
      permissions: [],
    });

    await expect(service.buildRequestUser('u1', 2)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('aceita JWT com tokenVersion atual', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      role: UserRole.ADMIN,
      companyId: null,
      deletedAt: null,
      status: UserStatus.ACTIVE,
      tokenVersion: 1,
      permissions: [],
      companyMemberships: [],
    });

    const user = await service.buildRequestUser('u1', 1);
    expect(user.userId).toBe('u1');
    expect(user.role).toBe(UserRole.ADMIN);
  });

  it('não rebaixa ADMIN por membership residual', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'admin@alle.com',
      role: UserRole.ADMIN,
      companyId: 'alle',
      deletedAt: null,
      status: UserStatus.ACTIVE,
      tokenVersion: 1,
      permissions: [],
      companyMemberships: [
        {
          clientRole: UserRole.CLIENT_MEMBER,
          company: { id: 'ponteiras', name: 'Ponteiras', deletedAt: null },
        },
      ],
    });
    prisma.user.update = jest.fn();

    const user = await service.buildRequestUser('u1', 1);
    expect(user.role).toBe(UserRole.ADMIN);
    expect(user.companyId).toBe('alle');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
