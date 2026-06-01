import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Permission,
  PermissionModule,
  User,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AuthenticatedRequestUser,
  EffectiveModulePermission,
} from '../auth/auth-request-user';

const ALL_MODULES = Object.values(PermissionModule);

const NONE: Omit<EffectiveModulePermission, 'module'> = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
};

/** Quando não há linha em `permissions` para o módulo, usa estes padrões por papel. */
const ROLE_FALLBACK: Record<
  UserRole,
  Partial<Record<PermissionModule, Omit<EffectiveModulePermission, 'module'>>>
> = {
  ADMIN: {},
  COLLABORATOR: {
    DASHBOARD: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    GMUD: {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
      canApprove: true,
    },
    MONITORING: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    TICKETS: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    CONTRACTS: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    RENDIMENTO: {
      canView: true,
      canCreate: false,
      canEdit: true,
      canDelete: false,
      canApprove: false,
    },
    CORREIO: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    INVENTARIO: {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canApprove: false,
    },
  },
  PJ: {
    DASHBOARD: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    GMUD: {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
      canApprove: true,
    },
    MONITORING: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    TICKETS: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    CONTRACTS: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    CORREIO: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
  },
  CLIENT: {
    DASHBOARD: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    FINANCIAL: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    GMUD: {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
      canApprove: true,
    },
    MONITORING: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    TICKETS: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
  },
};

function mapRow(row: Permission): Omit<EffectiveModulePermission, 'module'> {
  return {
    canView: row.canView,
    canCreate: row.canCreate,
    canEdit: row.canEdit,
    canDelete: row.canDelete,
    canApprove: row.canApprove,
  };
}

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  computeEffective(
    user: User & { permissions: Permission[] },
  ): EffectiveModulePermission[] {
    if (user.role === UserRole.ADMIN) {
      return ALL_MODULES.map((module) => ({
        module,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canApprove: true,
      }));
    }

    const byModule = new Map<PermissionModule, Permission>();
    for (const p of user.permissions) {
      byModule.set(p.module, p);
    }

    return ALL_MODULES.map((module) => {
      const row = byModule.get(module);
      if (row) {
        return { module, ...mapRow(row) };
      }
      const fallback = ROLE_FALLBACK[user.role][module];
      if (fallback) {
        return { module, ...fallback };
      }
      return { module, ...NONE };
    });
  }

  async buildRequestUser(userId: string): Promise<AuthenticatedRequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Sessão inválida ou usuário inativo');
    }

    const permissions = this.computeEffective(user);

    return {
      userId: user.id,
      email: user.email,
      role: user.role as AuthenticatedRequestUser['role'],
      companyId: user.companyId,
      permissions,
    };
  }

  async getRawForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return {
      userId: user.id,
      role: user.role,
      permissions: user.permissions,
      effective: this.computeEffective(user),
    };
  }

  async replaceUserPermissions(
    userId: string,
    rows: Array<{
      module: PermissionModule;
      canView: boolean;
      canCreate: boolean;
      canEdit: boolean;
      canDelete: boolean;
      canApprove: boolean;
    }>,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!target) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (target.role === UserRole.ADMIN) {
      return {
        message:
          'Administradores possuem acesso total; permissões não são armazenadas.',
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.permission.deleteMany({ where: { userId } });

      if (rows.length) {
        await tx.permission.createMany({
          data: rows.map((r) => ({
            userId,
            module: r.module,
            canView: r.canView,
            canCreate: r.canCreate,
            canEdit: r.canEdit,
            canDelete: r.canDelete,
            canApprove: r.canApprove,
          })),
        });
      }
    });

    const updated = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { permissions: true },
    });

    return {
      message: 'Permissões atualizadas',
      effective: this.computeEffective(updated),
    };
  }
}
