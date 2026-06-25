import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DashboardFilters,
  ResolvedCompanyIntegration,
} from './dashboard.types';
import { zabbixGroupListIncludes } from '../companies/zabbix-groups.util';

@Injectable()
export class DashboardIntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveIntegrations(
    params: DashboardFilters,
  ): Promise<ResolvedCompanyIntegration> {
    let zabbixGroupName = params.group;
    let tifluxClientId: number | null = null;

    if (params.companyId) {
      const company = await this.prisma.company.findFirst({
        where: {
          id: params.companyId,
          deletedAt: null,
        },
      });

      if (company?.zabbixGroupName?.trim()) {
        zabbixGroupName = company.zabbixGroupName;
      }

      if (
        company?.tifluxClientId !== null &&
        company?.tifluxClientId !== undefined
      ) {
        tifluxClientId = company.tifluxClientId;
      }
    } else if (params.group?.trim()) {
      const companiesByGroup = await this.prisma.company.findMany({
        where: {
          deletedAt: null,
        },
      });
      const companyByGroup = companiesByGroup.find((company) =>
        zabbixGroupListIncludes(company.zabbixGroupName, params.group.trim()),
      );

      if (
        companyByGroup?.tifluxClientId !== null &&
        companyByGroup?.tifluxClientId !== undefined
      ) {
        tifluxClientId = companyByGroup.tifluxClientId;
      }

      if (companyByGroup?.zabbixGroupName?.trim()) {
        zabbixGroupName = companyByGroup.zabbixGroupName;
      }
    }

    return {
      zabbixGroupName,
      tifluxClientId,
    };
  }
}
