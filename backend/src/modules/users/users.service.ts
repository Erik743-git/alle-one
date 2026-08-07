import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ClientCompanyRole, User, UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isUserOnline } from '../../common/presence/presence.util';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { resolveRendimentoSchedule } from './user-rendimento-schedule.helper';
import { isClientPortalRole } from '../../common/security/client-portal-role';

function toClientCompanyRole(role: UserRole): ClientCompanyRole {
  return role === UserRole.CLIENT_MEMBER
    ? ClientCompanyRole.CLIENT_MEMBER
    : ClientCompanyRole.CLIENT_GESTOR;
}

type SpecialtySummary = {
  id: string;
  name: string;
  externalId: number | null;
};

type UserWithCompany = User & {
  company: { id: string; name: string } | null;
  specialty: SpecialtySummary | null;
  companyMemberships?: Array<{
    companyId: string;
    clientRole: ClientCompanyRole;
    company: { id: string; name: string };
  }>;
};

type PublicUser = Omit<
  UserWithCompany,
  'passwordHash' | 'lastSeenAt' | 'companyMemberships'
> & {
  /** Compat: array com 0–1 especialidade (substitui serviceDesks). */
  specialties: SpecialtySummary[];
  /** @deprecated Prefer specialty / specialties */
  serviceDesks: SpecialtySummary[];
  isOnline: boolean;
  companyMemberships: Array<{
    companyId: string;
    companyName: string;
    clientRole: ClientCompanyRole;
  }>;
};

const specialtyInclude = {
  specialty: {
    select: { id: true, name: true, externalId: true },
  },
} as const;

const membershipInclude = {
  companyMemberships: {
    include: { company: { select: { id: true, name: true } } },
  },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toPublicUser(user: UserWithCompany): PublicUser {
    const {
      passwordHash: _omit,
      lastSeenAt,
      specialty,
      companyMemberships,
      ...rest
    } = user;
    const specialties = specialty ? [specialty] : [];
    return {
      ...rest,
      specialty,
      specialties,
      serviceDesks: specialties,
      isOnline: isUserOnline(lastSeenAt),
      companyMemberships: (companyMemberships ?? []).map((m) => ({
        companyId: m.companyId,
        companyName: m.company.name,
        clientRole: m.clientRole,
      })),
    };
  }

  private async validateSpecialtyId(specialtyId?: string | null) {
    if (!specialtyId?.trim()) return null;
    const id = specialtyId.trim();
    const existing = await this.prisma.specialty.findFirst({
      where: { id, deletedAt: null, active: true },
      select: { id: true },
    });
    if (!existing) {
      throw new BadRequestException('Especialidade selecionada não existe.');
    }
    return id;
  }

  /** Aceita specialtyId ou o legado serviceDeskIds[0]. */
  private resolveIncomingSpecialtyId(data: {
    specialtyId?: string | null;
    serviceDeskIds?: string[];
  }) {
    if (data.serviceDeskIds !== undefined && data.serviceDeskIds.length > 1) {
      throw new BadRequestException(
        'Usuário pode ter apenas uma especialidade.',
      );
    }
    if (data.specialtyId !== undefined) {
      return data.specialtyId;
    }
    if (data.serviceDeskIds !== undefined) {
      return data.serviceDeskIds[0] ?? null;
    }
    return undefined;
  }

  async listSpecialties() {
    return this.prisma.specialty.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, externalId: true },
    });
  }

  /** @deprecated Prefer listSpecialties */
  async listServiceDesks() {
    return this.listSpecialties();
  }

  async findAll() {
    const rows = await this.prisma.user.findMany({
      include: {
        company: true,
        ...specialtyInclude,
        ...membershipInclude,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return rows.map((u) => this.toPublicUser(u));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        company: true,
        ...specialtyInclude,
        ...membershipInclude,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return this.toPublicUser(user);
  }

  async create(actor: AuthenticatedRequestUser, data: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
      include: {
        company: { select: { id: true, name: true } },
        companyMemberships: {
          include: { company: { select: { id: true, name: true } } },
        },
      },
    });

    if (existingUser) {
      const membershipNames = existingUser.companyMemberships
        .map((m) => m.company.name)
        .filter(Boolean);
      const companyNames =
        membershipNames.length > 0
          ? membershipNames
          : existingUser.company?.name
            ? [existingUser.company.name]
            : [];

      throw new ConflictException({
        code: 'EMAIL_EXISTS',
        message: 'Já existe um usuário com este e-mail',
        userId: existingUser.id,
        userName: existingUser.name,
        email: existingUser.email,
        role: existingUser.role,
        companyIds: existingUser.companyMemberships.map((m) => m.companyId),
        companyNames,
        canLinkCompany: isClientPortalRole(existingUser.role),
      });
    }

    if (isClientPortalRole(data.role) && !data.companyId) {
      throw new BadRequestException(
        'Usuários do portal do cliente precisam de empresa vinculada.',
      );
    }

    const firstAccess = data.firstAccess ?? true;
    const plainPassword = data.password?.trim();

    if (firstAccess && !plainPassword) {
      throw new BadRequestException(
        'Informe uma senha provisória para o primeiro acesso.',
      );
    }

    let passwordHash: string | null = null;

    if (plainPassword) {
      passwordHash = await bcrypt.hash(plainPassword, 10);
    }

    const incomingSpecialty = this.resolveIncomingSpecialtyId(data);
    const specialtyId = await this.validateSpecialtyId(incomingSpecialty);

    const schedule = resolveRendimentoSchedule(data);

    const created = await this.prisma.user.create({
      data: {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        passwordHash,
        role: data.role,
        status: data.status ?? UserStatus.ACTIVE,
        companyId: data.companyId ?? null,
        firstAccess,
        responsible: data.responsible ?? false,
        specialtyId,
        ...schedule,
      },
      include: {
        company: true,
        ...specialtyInclude,
      },
    });

    if (isClientPortalRole(created.role) && created.companyId) {
      await this.prisma.userCompany.upsert({
        where: {
          userId_companyId: {
            userId: created.id,
            companyId: created.companyId,
          },
        },
        create: {
          userId: created.id,
          companyId: created.companyId,
          clientRole: toClientCompanyRole(created.role),
        },
        update: {
          clientRole: toClientCompanyRole(created.role),
        },
      });
    }

    await this.audit.log({
      actor,
      action: 'CREATE',
      entity: 'User',
      entityId: created.id,
      payload: {
        before: null,
        after: {
          id: created.id,
          name: created.name,
          email: created.email,
          role: created.role,
          status: created.status,
          companyId: created.companyId,
          firstAccess: created.firstAccess,
          responsible: created.responsible,
          specialtyId: created.specialtyId,
        },
      },
    });

    return this.toPublicUser(created);
  }

  async update(
    actor: AuthenticatedRequestUser,
    id: string,
    data: UpdateUserDto,
  ) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const enablingFirstAccess =
      data.firstAccess === true && existingUser.firstAccess === false;

    if (enablingFirstAccess && !data.password?.trim()) {
      throw new BadRequestException(
        'Informe uma senha provisória ao marcar primeiro acesso.',
      );
    }

    const passwordChanging = Boolean(data.password?.trim());

    let passwordHash = existingUser.passwordHash;

    if (passwordChanging) {
      passwordHash = await bcrypt.hash(data.password!.trim(), 10);
    }

    if (data.firstAccess === true && !passwordHash) {
      throw new BadRequestException(
        'Usuário em primeiro acesso precisa de senha provisória definida.',
      );
    }

    const incomingSpecialty = this.resolveIncomingSpecialtyId(data);
    const specialtyId =
      incomingSpecialty !== undefined
        ? await this.validateSpecialtyId(incomingSpecialty)
        : undefined;

    const schedule =
      data.rendimentoCustomSchedule !== undefined ||
      data.rendimentoDailyWorkMinutes !== undefined ||
      data.rendimentoLunchMinutes !== undefined
        ? resolveRendimentoSchedule({
            rendimentoCustomSchedule:
              data.rendimentoCustomSchedule ??
              existingUser.rendimentoCustomSchedule,
            rendimentoDailyWorkMinutes:
              data.rendimentoDailyWorkMinutes !== undefined
                ? data.rendimentoDailyWorkMinutes
                : existingUser.rendimentoDailyWorkMinutes,
            rendimentoLunchMinutes:
              data.rendimentoLunchMinutes !== undefined
                ? data.rendimentoLunchMinutes
                : existingUser.rendimentoLunchMinutes,
          })
        : undefined;

    const nextStatus = data.status ?? existingUser.status;
    const nextResponsible =
      nextStatus === UserStatus.INACTIVE
        ? false
        : data.responsible !== undefined
          ? data.responsible
          : existingUser.responsible;

    if (data.email !== undefined) {
      const nextEmail = data.email.trim().toLowerCase();
      if (nextEmail !== existingUser.email.trim().toLowerCase()) {
        const emailTaken = await this.prisma.user.findUnique({
          where: { email: nextEmail },
          include: {
            company: { select: { id: true, name: true } },
            companyMemberships: {
              include: { company: { select: { id: true, name: true } } },
            },
          },
        });
        if (emailTaken && emailTaken.id !== id) {
          const membershipNames = emailTaken.companyMemberships
            .map((m) => m.company.name)
            .filter(Boolean);
          const companyNames =
            membershipNames.length > 0
              ? membershipNames
              : emailTaken.company?.name
                ? [emailTaken.company.name]
                : [];

          throw new ConflictException({
            code: 'EMAIL_EXISTS',
            message: 'Já existe um usuário com este e-mail',
            userId: emailTaken.id,
            userName: emailTaken.name,
            email: emailTaken.email,
            role: emailTaken.role,
            companyIds: emailTaken.companyMemberships.map((m) => m.companyId),
            companyNames,
            canLinkCompany: isClientPortalRole(emailTaken.role),
          });
        }
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.email !== undefined && {
          email: data.email.trim().toLowerCase(),
        }),
        passwordHash,
        ...(passwordChanging && { tokenVersion: { increment: 1 } }),
        role: data.role,
        status: data.status,
        companyId: data.companyId,
        firstAccess: data.firstAccess,
        responsible: nextResponsible,
        ...(specialtyId !== undefined ? { specialtyId } : {}),
        ...(schedule ?? {}),
      },
      include: {
        company: true,
        ...specialtyInclude,
      },
    });

    if (isClientPortalRole(updated.role) && updated.companyId) {
      await this.prisma.userCompany.upsert({
        where: {
          userId_companyId: {
            userId: updated.id,
            companyId: updated.companyId,
          },
        },
        create: {
          userId: updated.id,
          companyId: updated.companyId,
          clientRole: toClientCompanyRole(updated.role),
        },
        update: {
          clientRole: toClientCompanyRole(updated.role),
        },
      });

      // Troca de empresa no formulário admin: remove o vínculo antigo
      // para não sobrar membership fantasma (botão "trocar empresa" indevido).
      const previousCompanyId = existingUser.companyId;
      if (
        previousCompanyId &&
        previousCompanyId !== updated.companyId &&
        data.companyId !== undefined
      ) {
        await this.prisma.userCompany.deleteMany({
          where: {
            userId: updated.id,
            companyId: previousCompanyId,
          },
        });
      }
    }

    if (
      data.companyId !== undefined &&
      !updated.companyId &&
      isClientPortalRole(updated.role)
    ) {
      await this.prisma.userCompany.deleteMany({
        where: { userId: updated.id },
      });
    }

    if (
      data.role !== undefined &&
      !isClientPortalRole(updated.role) &&
      isClientPortalRole(existingUser.role)
    ) {
      await this.prisma.userCompany.deleteMany({
        where: { userId: updated.id },
      });
    }

    await this.audit.log({
      actor,
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      payload: {
        before: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role,
          status: existingUser.status,
          companyId: existingUser.companyId,
          firstAccess: existingUser.firstAccess,
          responsible: existingUser.responsible,
          specialtyId: existingUser.specialtyId,
        },
        after: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          role: updated.role,
          status: updated.status,
          companyId: updated.companyId,
          firstAccess: updated.firstAccess,
          responsible: updated.responsible,
          specialtyId: updated.specialtyId,
        },
      },
    });

    return this.toPublicUser(updated);
  }

  async listCompanyMemberships(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const rows = await this.prisma.userCompany.findMany({
      where: { userId },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { company: { name: 'asc' } },
    });
    return rows.map((r) => ({
      companyId: r.companyId,
      companyName: r.company.name,
      clientRole: r.clientRole,
    }));
  }

  async upsertCompanyMembership(
    actor: AuthenticatedRequestUser,
    userId: string,
    data: { companyId: string; clientRole: ClientCompanyRole },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (!isClientPortalRole(user.role)) {
      throw new BadRequestException(
        'Somente usuários CLIENT_* podem ter memberships multi-empresa.',
      );
    }
    const company = await this.prisma.company.findUnique({
      where: { id: data.companyId },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const row = await this.prisma.userCompany.upsert({
      where: {
        userId_companyId: { userId, companyId: data.companyId },
      },
      create: {
        userId,
        companyId: data.companyId,
        clientRole: data.clientRole,
      },
      update: { clientRole: data.clientRole },
      include: { company: { select: { id: true, name: true } } },
    });

    await this.audit.log({
      actor,
      action: 'UPSERT',
      entity: 'UserCompany',
      entityId: userId,
      payload: {
        companyId: row.companyId,
        clientRole: row.clientRole,
      },
    });

    return {
      companyId: row.companyId,
      companyName: row.company.name,
      clientRole: row.clientRole,
    };
  }

  async removeCompanyMembership(
    actor: AuthenticatedRequestUser,
    userId: string,
    companyId: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const existing = await this.prisma.userCompany.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });
    if (!existing) {
      throw new NotFoundException('Vínculo empresa não encontrado');
    }
    if (user.companyId === companyId) {
      throw new BadRequestException(
        'Não remova a empresa ativa do usuário. Troque a empresa ativa antes.',
      );
    }

    await this.prisma.userCompany.delete({
      where: { userId_companyId: { userId, companyId } },
    });

    await this.audit.log({
      actor,
      action: 'DELETE',
      entity: 'UserCompany',
      entityId: userId,
      payload: { companyId },
    });

    return { ok: true };
  }

  async remove(actor: AuthenticatedRequestUser, id: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const deactivated = await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.INACTIVE,
        responsible: false,
      },
      include: {
        company: true,
        ...specialtyInclude,
      },
    });

    await this.audit.log({
      actor,
      action: 'INACTIVATE',
      entity: 'User',
      entityId: id,
      payload: {
        before: {
          id: existingUser.id,
          status: existingUser.status,
        },
        after: {
          id: deactivated.id,
          status: deactivated.status,
        },
      },
    });

    return this.toPublicUser(deactivated);
  }
}
