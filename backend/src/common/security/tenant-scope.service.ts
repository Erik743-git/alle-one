import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../../modules/auth/auth-request-user';
import {
  parseZabbixGroupNames,
  zabbixGroupListIncludes,
} from '../../modules/companies/zabbix-groups.util';

@Injectable()
export class TenantScopeService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadCompanyForClient(user: AuthenticatedRequestUser) {
    if (!user.companyId) {
      throw new ForbiddenException('Usuário sem empresa vinculada');
    }

    const company = await this.prisma.company.findFirst({
      where: { id: user.companyId, deletedAt: null },
      select: {
        id: true,
        tifluxClientId: true,
        zabbixGroupName: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    return company;
  }

  /** Força ou valida client_ids do TiFlux para usuários CLIENT. */
  async resolveTifluxClientIds(
    user: AuthenticatedRequestUser,
    requested?: number[],
  ): Promise<number[] | undefined> {
    if (user.role !== 'CLIENT') {
      return requested;
    }

    const company = await this.loadCompanyForClient(user);
    if (!company.tifluxClientId) {
      throw new ForbiddenException('Empresa sem cliente TiFlux configurado');
    }

    const allowedId = company.tifluxClientId;

    if (requested?.length) {
      const invalid = requested.filter((id) => id !== allowedId);
      if (invalid.length > 0) {
        throw new ForbiddenException(
          'client_ids não permitido para a sua empresa',
        );
      }
      return requested;
    }

    return [allowedId];
  }

  /** Valida que o grupo Zabbix pertence à empresa do CLIENT. */
  async assertZabbixGroupAccess(
    user: AuthenticatedRequestUser,
    group: string,
  ): Promise<string> {
    const normalized = group.trim();
    if (!normalized) {
      throw new ForbiddenException('Grupo Zabbix inválido');
    }

    if (user.role !== 'CLIENT') {
      return normalized;
    }

    const company = await this.loadCompanyForClient(user);
    const allowed = parseZabbixGroupNames(company.zabbixGroupName);

    if (!allowed.length) {
      throw new ForbiddenException('Empresa sem grupo Zabbix configurado');
    }

    if (!zabbixGroupListIncludes(company.zabbixGroupName, normalized)) {
      throw new ForbiddenException(
        'Grupo Zabbix não permitido para sua empresa',
      );
    }

    return allowed.find(
      (group) => group.toLowerCase() === normalized.toLowerCase(),
    )!;
  }

  /** CLIENT só enxerga o próprio grupo no monitoramento. */
  async resolveZabbixGroupForList(
    user: AuthenticatedRequestUser,
  ): Promise<string | null> {
    if (user.role !== 'CLIENT') {
      return null;
    }

    const company = await this.loadCompanyForClient(user);
    return parseZabbixGroupNames(company.zabbixGroupName).join(';') || null;
  }
}
