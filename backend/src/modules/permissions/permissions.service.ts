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
import { isClientPortalRole } from '../../common/security/client-portal-role';
import { DEFAULT_COMPANY_PACK_MODULES } from './company-pack.constants';

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
      canCreate: true,
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
    PROJECTS: {
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
      canCreate: true,
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
    PROJECTS: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
  },
  CLIENT: {
    // legado (= GESTOR) até migração
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
      canCreate: true,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    INVENTARIO: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    PROJECTS: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    RENDIMENTO: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
  },
  CLIENT_GESTOR: {
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
      canCreate: true,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    INVENTARIO: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    PROJECTS: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    RENDIMENTO: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
  },
  CLIENT_MEMBER: {
    DASHBOARD: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    TICKETS: {
      canView: true,
      canCreate: true,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    MONITORING: {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
    },
    GMUD: {
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
    enabledPackModules?: Set<PermissionModule> | null,
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

    const base = ALL_MODULES.map((module) => {
      const row = byModule.get(module);
      if (row) {
        return { module, ...mapRow(row) };
      }
      const fallback = ROLE_FALLBACK[user.role]?.[module];
      if (fallback) {
        return { module, ...fallback };
      }
      return { module, ...NONE };
    });

    if (!isClientPortalRole(user.role)) {
      return base;
    }

    // Pack da empresa: módulo fora do pack → tudo false.
    const pack =
      enabledPackModules ??
      new Set<PermissionModule>(DEFAULT_COMPANY_PACK_MODULES);
    return base.map((entry) => {
      if (pack.has(entry.module)) return entry;
      return { module: entry.module, ...NONE };
    });
  }

  async resolveCompanyPackModules(
    companyId: string | null | undefined,
  ): Promise<Set<PermissionModule>> {
    if (!companyId) {
      return new Set(DEFAULT_COMPANY_PACK_MODULES);
    }
    const rows = await this.prisma.companyModule.findMany({
      where: { companyId, enabled: true },
      select: { module: true },
    });
    if (rows.length === 0) {
      return new Set(DEFAULT_COMPANY_PACK_MODULES);
    }
    return new Set(rows.map((r) => r.module));
  }

  async buildRequestUser(
    userId: string,
    tokenVersion?: number,
  ): Promise<AuthenticatedRequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        permissions: true,
        companyMemberships: {
          include: {
            company: { select: { id: true, name: true, deletedAt: true } },
          },
        },
      },
    });

    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Sessão inválida ou usuário inativo');
    }

    const expectedTv = tokenVersion ?? 0;
    if ((user.tokenVersion ?? 0) !== expectedTv) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }

    const companies = (user.companyMemberships ?? [])
      .filter((m) => !m.company.deletedAt)
      .map((m) => ({
        id: m.company.id,
        name: m.company.name,
        clientRole: m.clientRole as 'CLIENT_GESTOR' | 'CLIENT_MEMBER',
      }));

    let effectiveRole = user.role as AuthenticatedRequestUser['role'];
    let activeCompanyId = user.companyId;

    // Memberships só mandam no papel/empresa ativa de usuários CLIENT_*.
    // Nunca rebaixar ADMIN/COLLAB/PJ por ter um vínculo residual em user_companies.
    if (companies.length > 0 && isClientPortalRole(user.role)) {
      const active =
        companies.find((c) => c.id === user.companyId) ?? companies[0];
      activeCompanyId = active.id;
      effectiveRole = active.clientRole;
      if (user.companyId !== active.id || user.role !== active.clientRole) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            companyId: active.id,
            role: active.clientRole as UserRole,
          },
        });
      }
    }

    const pack = isClientPortalRole(effectiveRole)
      ? await this.resolveCompanyPackModules(activeCompanyId)
      : null;

    const permissions = this.computeEffective(
      { ...user, role: effectiveRole as UserRole },
      pack,
    );

    return {
      userId: user.id,
      email: user.email,
      role: effectiveRole,
      companyId: activeCompanyId,
      permissions,
      companies: companies.length > 0 ? companies : undefined,
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

    const pack = isClientPortalRole(user.role)
      ? await this.resolveCompanyPackModules(user.companyId)
      : null;

    return {
      userId: user.id,
      role: user.role,
      permissions: user.permissions,
      effective: this.computeEffective(user, pack),
      companyPackModules: pack ? Array.from(pack) : null,
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

    const pack = isClientPortalRole(updated.role)
      ? await this.resolveCompanyPackModules(updated.companyId)
      : null;

    return {
      message: 'Permissões atualizadas',
      effective: this.computeEffective(updated, pack),
    };
  }

  /** Substitui o pack de módulos contratados da empresa. */
  async replaceCompanyModules(companyId: string, modules: PermissionModule[]) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
    });
    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    const unique = Array.from(new Set(modules));
    await this.prisma.$transaction(async (tx) => {
      await tx.companyModule.deleteMany({ where: { companyId } });
      if (unique.length) {
        await tx.companyModule.createMany({
          data: unique.map((module) => ({
            companyId,
            module,
            enabled: true,
          })),
        });
      }
    });

    return {
      companyId,
      modules: unique,
    };
  }

  async listCompanyModules(companyId: string) {
    const rows = await this.prisma.companyModule.findMany({
      where: { companyId, enabled: true },
      select: { module: true },
      orderBy: { module: 'asc' },
    });
    if (rows.length === 0) {
      return DEFAULT_COMPANY_PACK_MODULES;
    }
    return rows.map((r) => r.module);
  }
}
