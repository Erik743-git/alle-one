import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DashboardFilters,
  ResolvedCompanyIntegration,
} from './dashboard.types';
import {
  parseZabbixGroupNames,
  zabbixGroupListIncludes,
} from '../companies/zabbix-groups.util';

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
        const requested = params.group?.trim() ?? '';
        const companyGroups = parseZabbixGroupNames(company.zabbixGroupName);
        // Pedido de UM grupo da lista (ex. relatório GMO) → não expandir para todos
        if (
          requested &&
          !requested.includes(';') &&
          companyGroups.length > 1 &&
          zabbixGroupListIncludes(company.zabbixGroupName, requested)
        ) {
          zabbixGroupName = requested;
        } else {
          zabbixGroupName = company.zabbixGroupName;
        }
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

      // Mantém o grupo pedido (não junta todos os grupos da empresa)
      zabbixGroupName = params.group.trim();
    }

    return {
      zabbixGroupName,
      tifluxClientId,
    };
  }
}
