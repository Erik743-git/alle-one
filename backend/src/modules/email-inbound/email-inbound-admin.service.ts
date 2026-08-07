import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { MicrosoftGraphMailClient } from './microsoft-graph-mail.client';
import { EmailInboundIngestService } from './email-inbound-ingest.service';

export class UpsertEmailInboundSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sharedMailboxAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  useAsRequester?: string;

  @IsOptional()
  @IsString()
  graphTenantId?: string;

  @IsOptional()
  @IsString()
  graphClientId?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Remetentes/domínios bloqueados (um por linha). */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  blockedSenders?: string | null;
}

export class CreateEmailInboundRouteDto {
  @IsString()
  @MaxLength(255)
  matchEmail!: string;

  @IsOptional()
  @IsString()
  specialtyId?: string;

  /** @deprecated Prefer specialtyId */
  @IsOptional()
  @IsString()
  deskId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  priorityName?: string;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}

export class UpdateEmailInboundRouteDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  matchEmail?: string;

  @IsOptional()
  @IsString()
  specialtyId?: string | null;

  /** @deprecated Prefer specialtyId */
  @IsOptional()
  @IsString()
  deskId?: string | null;

  @IsOptional()
  @IsString()
  companyId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  priorityName?: string | null;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

@Injectable()
export class EmailInboundAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: MicrosoftGraphMailClient,
    private readonly ingest: EmailInboundIngestService,
  ) {}

  async getSettings() {
    const row = await this.ingest.getOrCreateSettings();
    return {
      ...row,
      graphConfigured: this.graph.isConfigured({
        tenantId: row.graphTenantId,
        clientId: row.graphClientId,
      }),
      graphClientSecretConfigured: Boolean(
        process.env.GRAPH_CLIENT_SECRET?.trim(),
      ),
    };
  }

  async updateSettings(dto: UpsertEmailInboundSettingsDto) {
    await this.ingest.getOrCreateSettings();
    return this.prisma.emailInboundSettings.update({
      where: { id: 'default' },
      data: {
        sharedMailboxAddress: dto.sharedMailboxAddress?.trim() || null,
        useAsRequester: dto.useAsRequester?.trim() || 'Remetente',
        graphTenantId: dto.graphTenantId?.trim() || null,
        graphClientId: dto.graphClientId?.trim() || null,
        enabled: dto.enabled ?? undefined,
        blockedSenders:
          dto.blockedSenders === undefined
            ? undefined
            : dto.blockedSenders?.trim() || null,
      },
    });
  }

  async listRoutes() {
    return this.prisma.emailInboundRoute.findMany({
      where: { deletedAt: null },
      include: {
        specialty: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRoute(
    actor: AuthenticatedRequestUser,
    dto: CreateEmailInboundRouteDto,
  ) {
    const matchEmail = dto.matchEmail.trim().toLowerCase();
    if (!matchEmail)
      throw new BadRequestException('E-mail de match obrigatório.');
    return this.prisma.emailInboundRoute.create({
      data: {
        id: randomUUID(),
        matchEmail,
        specialtyId: dto.specialtyId || dto.deskId || null,
        companyId: dto.companyId || null,
        priorityName: dto.priorityName?.trim() || null,
        verified: dto.verified ?? false,
        createdBy: actor.userId,
      },
    });
  }

  async updateRoute(id: string, dto: UpdateEmailInboundRouteDto) {
    const existing = await this.prisma.emailInboundRoute.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing)
      throw new NotFoundException('Direcionamento não encontrado.');
    const specialtyId =
      dto.specialtyId !== undefined
        ? dto.specialtyId || null
        : dto.deskId !== undefined
          ? dto.deskId || null
          : undefined;
    return this.prisma.emailInboundRoute.update({
      where: { id },
      data: {
        matchEmail: dto.matchEmail?.trim().toLowerCase(),
        specialtyId,
        companyId:
          dto.companyId === undefined ? undefined : dto.companyId || null,
        priorityName:
          dto.priorityName === undefined
            ? undefined
            : dto.priorityName?.trim() || null,
        verified: dto.verified,
        active: dto.active,
      },
    });
  }

  async deleteRoute(id: string) {
    const existing = await this.prisma.emailInboundRoute.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing)
      throw new NotFoundException('Direcionamento não encontrado.');
    return this.prisma.emailInboundRoute.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
  }

  async pollNow() {
    return this.ingest.pollMailbox();
  }
}
