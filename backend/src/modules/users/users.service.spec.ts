import { BadRequestException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { UsersService } from './users.service';

describe('UsersService.create', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const audit = {
    log: jest.fn(),
  };

  const service = new UsersService(prisma as never, audit as never);

  const actor = {
    userId: 'admin-1',
    email: 'admin@test.com',
    role: 'ADMIN' as const,
    companyId: null,
    permissions: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exige senha provisória quando firstAccess é true', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.create(actor, {
        name: 'Novo',
        email: 'novo@test.com',
        role: UserRole.CLIENT,
        firstAccess: true,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('cria usuário com senha hasheada', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      name: 'Novo',
      email: 'novo@test.com',
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      firstAccess: true,
      responsible: false,
      companyId: 'c1',
      company: null,
      serviceDeskLinks: [],
    });

    await service.create(actor, {
      name: 'Novo',
      email: 'novo@test.com',
      password: 'Senha@123',
      role: UserRole.CLIENT,
      companyId: 'c1',
      firstAccess: true,
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'novo@test.com',
          passwordHash: expect.any(String),
          firstAccess: true,
        }),
      }),
    );
  });
});

describe('UsersService.update', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const audit = {
    log: jest.fn(),
  };

  const service = new UsersService(prisma as never, audit as never);

  const actor = {
    userId: 'admin-1',
    email: 'admin@test.com',
    role: 'ADMIN' as const,
    companyId: null,
    permissions: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('incrementa tokenVersion ao alterar senha', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      passwordHash: 'old-hash',
      firstAccess: false,
    });
    prisma.user.update.mockResolvedValue({
      id: 'u1',
      name: 'User',
      email: 'u@test.com',
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      firstAccess: false,
      responsible: false,
      companyId: null,
      company: null,
      serviceDeskLinks: [],
    });

    await service.update(actor, 'u1', {
      password: 'Nova@123',
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenVersion: { increment: 1 },
          passwordHash: expect.any(String),
        }),
      }),
    );
  });
});
