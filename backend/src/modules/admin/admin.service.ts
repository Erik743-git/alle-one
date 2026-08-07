import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PresenceService } from '../../common/presence/presence.service';
import { UserRole } from '@prisma/client';
import type { AdminAuditLogsQuery } from './admin-audit.query';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  async getOverviewStats() {
    const [
      companiesActive,
      companiesTotal,
      usersActive,
      usersOnline,
      adminUsers,
      contractFilesCount,
    ] = await Promise.all([
      this.prisma.company.count({
        where: { deletedAt: null, status: true },
      }),
      this.prisma.company.count({
        where: { deletedAt: null },
      }),
      this.prisma.user.count({
        where: { deletedAt: null, status: 'ACTIVE' },
      }),
      this.presence.countOnlineUsers(),
      this.prisma.user.count({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          role: UserRole.ADMIN,
        },
      }),
      this.prisma.contractFile.count(),
    ]);

    return {
      companiesActive,
      companiesTotal,
      usersActive,
      usersOnline,
      adminUsers,
      contractFilesCount,
    };
  }

  async listAuditLogs(query: AdminAuditLogsQuery) {
    const limit = query.limit;
    const offset = query.offset;
    const order = query.order;

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    const where = {
      ...(query.actorId ? { userId: query.actorId } : {}),
      ...(query.entity
        ? { entity: { contains: query.entity, mode: 'insensitive' as const } }
        : {}),
      ...(query.action
        ? { action: { contains: query.action, mode: 'insensitive' as const } }
        : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: order },
        skip: offset,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      }),
    ]);

    return {
      total,
      offset,
      limit,
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        userId: row.userId,
        user: row.user
          ? {
              id: row.user.id,
              name: row.user.name,
              email: row.user.email,
              role: row.user.role,
            }
          : null,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        payload: row.payload,
      })),
    };
  }
}
