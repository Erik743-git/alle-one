import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TifluxService } from '../tiflux/tiflux.service';
import type { AuthenticatedRequestUser } from '../gmud/gmud.types';
import type {
  ListContractsQueryDto,
  TifluxContractStatus,
} from './contracts.dto';

type TifluxContract = {
  id: number;
  cancelled: boolean;
  client: { id: number; name: string };
  contract_type: { id: number; name: string };
  duration: number;
  expiration_date: string;
  modality: string;
  name: string;
  readjust_duration: number;
  readjustment_date: string;
  rider_tax: string | '--';
  rider_value: string | '--';
  status: TifluxContractStatus;
  total_value: string | '--';
};

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiflux: TifluxService,
  ) {}

  private async resolveCompanyId(
    user: AuthenticatedRequestUser,
    companyId?: string,
  ) {
    if (user.role === 'CLIENT') {
      if (!user.companyId) {
        throw new ForbiddenException('Usuário CLIENT sem empresa vinculada');
      }
      return user.companyId;
    }

    if (!companyId) {
      throw new ForbiddenException('companyId é obrigatório para este perfil');
    }

    return companyId;
  }

  private parseStatusList(raw?: string): TifluxContractStatus[] | undefined {
    if (!raw?.trim()) return undefined;
    const values = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean) as string[];

    const allowed: TifluxContractStatus[] = ['actives', 'readjust', 'expired'];
    const filtered = values.filter((v) =>
      allowed.includes(v as TifluxContractStatus),
    );
    return filtered.length ? (filtered as TifluxContractStatus[]) : undefined;
  }

  async list(user: AuthenticatedRequestUser, query: ListContractsQueryDto) {
    const resolvedCompanyId = await this.resolveCompanyId(
      user,
      query.companyId,
    );

    const company = await this.prisma.company.findFirst({
      where: { id: resolvedCompanyId, deletedAt: null },
      select: { id: true, name: true, tifluxClientId: true },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    if (!company.tifluxClientId) {
      return {
        company: { id: company.id, name: company.name },
        meta: {
          offset: query.offset ?? 1,
          limit: query.limit ?? 20,
          totalItems: 0,
        },
        items: [] as TifluxContract[],
      };
    }

    const offset = query.offset ?? 1;
    const limit = query.limit ?? 20;
    const statusList = this.parseStatusList(query.status);

    const search = new URLSearchParams();
    search.set('offset', String(offset));
    search.set('limit', String(limit));
    search.set('client_ids', String(company.tifluxClientId));
    if (statusList?.length) {
      search.set('status', statusList.join(','));
    }

    const path = `/contracts?${search.toString()}`;
    const { data: contracts, totalItems } =
      await this.tiflux.requestResourceWithMeta<TifluxContract[]>(path, 'GET');

    return {
      company: { id: company.id, name: company.name },
      meta: {
        offset,
        limit,
        totalItems,
      },
      items: contracts as TifluxContract[],
    };
  }
}
