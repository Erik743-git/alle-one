import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../../modules/auth/auth-request-user';
import { isClientPortalRole } from './client-portal-role';
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

  /** Cliente TiFlux da empresa Alle Tecnologia (quando configurado). */
  async resolveAlleTifluxClientId(): Promise<number | null> {
    const alle = await this.prisma.company.findFirst({
      where: {
        deletedAt: null,
        tifluxClientId: { not: null },
        OR: [
          { email: 'contato@alletecnologia.com' },
          { name: { equals: 'Alle Tecnologia', mode: 'insensitive' } },
        ],
      },
      select: { tifluxClientId: true },
      orderBy: { createdAt: 'asc' },
    });
    const id = alle?.tifluxClientId;
    return id != null && Number.isFinite(Number(id)) ? Number(id) : null;
  }

  /** Força ou valida client_ids do TiFlux para usuários CLIENT. */
  async resolveTifluxClientIds(
    user: AuthenticatedRequestUser,
    requested?: number[],
  ): Promise<number[] | undefined> {
    if (!isClientPortalRole(user.role)) {
      return requested;
    }

    const company = await this.loadCompanyForClient(user);
    if (!company.tifluxClientId) {
      throw new ForbiddenException('Empresa sem cliente vinculado configurado');
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

  /**
   * Clientes permitidos na abertura de chamado: empresa do usuário + Alle.
   * A listagem geral continua no cliente da empresa (ver resolveTifluxClientIds).
   */
  async resolveTifluxClientIdsForTicketCreate(
    user: AuthenticatedRequestUser,
  ): Promise<number[] | undefined> {
    if (!isClientPortalRole(user.role)) {
      return undefined;
    }

    const own = await this.resolveTifluxClientIds(user);
    const alleId = await this.resolveAlleTifluxClientId();
    const ids = [...(own ?? [])];
    if (alleId != null && !ids.includes(alleId)) {
      ids.push(alleId);
    }
    return ids;
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

    if (!isClientPortalRole(user.role)) {
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
    if (!isClientPortalRole(user.role)) {
      return null;
    }

    const company = await this.loadCompanyForClient(user);
    return parseZabbixGroupNames(company.zabbixGroupName).join(';') || null;
  }
}
