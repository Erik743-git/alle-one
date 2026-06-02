import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { User, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

type UserWithCompany = User & {
  company: { id: string; name: string } | null;
  serviceDeskLinks: Array<{
    serviceDesk: { id: string; name: string; externalId: number | null };
  }>;
};

type PublicUser = Omit<UserWithCompany, 'passwordHash' | 'serviceDeskLinks'> & {
  serviceDesks: Array<{ id: string; name: string; externalId: number | null }>;
};

type ServiceDeskSourceRow = {
  desk_external_id: number | null;
  desk_name: string | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toPublicUser(user: UserWithCompany): PublicUser {
    const { passwordHash: _omit, serviceDeskLinks, ...rest } = user;
    return {
      ...rest,
      serviceDesks: serviceDeskLinks.map((link) => link.serviceDesk),
    };
  }

  private async validateServiceDeskIds(serviceDeskIds: string[]) {
    const ids = Array.from(new Set(serviceDeskIds.map((id) => id.trim()))).filter(
      Boolean,
    );
    if (ids.length === 0) return [];

    const existing = await this.prisma.serviceDesk.findMany({
      where: { id: { in: ids }, deletedAt: null, active: true },
      select: { id: true },
    });

    if (existing.length !== ids.length) {
      throw new BadRequestException(
        'Uma ou mais mesas de serviço selecionadas não existem.',
      );
    }

    return ids;
  }

  private async syncServiceDesksFromTifluxTickets() {
    const rows =
      (await this.prisma.$queryRaw<ServiceDeskSourceRow[]>`
      select distinct
        t.desk_external_id,
        nullif(trim(t.desk_name), '') as desk_name
      from tiflux.tickets t
      where t.desk_name is not null
    `) ?? [];

    for (const row of rows) {
      const name = row.desk_name?.trim();
      if (!name) continue;
      const externalId =
        row.desk_external_id == null ? null : Number(row.desk_external_id);

      if (externalId != null && !Number.isNaN(externalId)) {
        await this.prisma.serviceDesk.upsert({
          where: { externalId },
          update: { name, active: true, deletedAt: null },
          create: { externalId, name, active: true },
        });
      } else {
        await this.prisma.serviceDesk.upsert({
          where: { name },
          update: { active: true, deletedAt: null },
          create: { name, active: true },
        });
      }
    }
  }

  async listServiceDesks() {
    await this.syncServiceDesksFromTifluxTickets();
    return this.prisma.serviceDesk.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, externalId: true },
    });
  }

  async findAll() {
    const rows = await this.prisma.user.findMany({
      include: {
        company: true,
        serviceDeskLinks: {
          include: {
            serviceDesk: {
              select: { id: true, name: true, externalId: true },
            },
          },
        },
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
        serviceDeskLinks: {
          include: {
            serviceDesk: {
              select: { id: true, name: true, externalId: true },
            },
          },
        },
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
    });

    if (existingUser) {
      throw new BadRequestException('Já existe um usuário com este e-mail');
    }

    let passwordHash: string | null = null;

    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }

    const serviceDeskIds = await this.validateServiceDeskIds(
      data.serviceDeskIds ?? [],
    );

    const created = await this.prisma.user.create({
      data: {
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        passwordHash,
        role: data.role,
        status: data.status ?? UserStatus.ACTIVE,
        companyId: data.companyId ?? null,
        firstAccess: data.firstAccess ?? true,
        responsible: data.responsible ?? false,
        serviceDeskLinks:
          serviceDeskIds.length > 0
            ? {
                createMany: {
                  data: serviceDeskIds.map((serviceDeskId) => ({ serviceDeskId })),
                },
              }
            : undefined,
      },
      include: {
        company: true,
        serviceDeskLinks: {
          include: {
            serviceDesk: {
              select: { id: true, name: true, externalId: true },
            },
          },
        },
      },
    });

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
        },
      },
    });

    return this.toPublicUser(created);
  }

  async update(actor: AuthenticatedRequestUser, id: string, data: UpdateUserDto) {
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

    let passwordHash = existingUser.passwordHash;

    if (data.password?.trim()) {
      passwordHash = await bcrypt.hash(data.password.trim(), 10);
    }

    if (data.firstAccess === true && !passwordHash) {
      throw new BadRequestException(
        'Usuário em primeiro acesso precisa de senha provisória definida.',
      );
    }

    const serviceDeskIds =
      data.serviceDeskIds !== undefined
        ? await this.validateServiceDeskIds(data.serviceDeskIds)
        : undefined;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.email !== undefined && { email: data.email.trim().toLowerCase() }),
        passwordHash,
        role: data.role,
        status: data.status,
        companyId: data.companyId,
        firstAccess: data.firstAccess,
        responsible: data.responsible,
        ...(serviceDeskIds !== undefined && {
          serviceDeskLinks: {
            deleteMany: {},
            ...(serviceDeskIds.length > 0
              ? {
                  createMany: {
                    data: serviceDeskIds.map((serviceDeskId) => ({
                      serviceDeskId,
                    })),
                  },
                }
              : {}),
          },
        }),
      },
      include: {
        company: true,
        serviceDeskLinks: {
          include: {
            serviceDesk: {
              select: { id: true, name: true, externalId: true },
            },
          },
        },
      },
    });

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
        },
      },
    });

    return this.toPublicUser(updated);
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
      },
      include: {
        company: true,
        serviceDeskLinks: {
          include: {
            serviceDesk: {
              select: { id: true, name: true, externalId: true },
            },
          },
        },
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
