import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverviewStats() {
    const [
      companiesActive,
      companiesTotal,
      usersActive,
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
      adminUsers,
      contractFilesCount,
    };
  }
}
