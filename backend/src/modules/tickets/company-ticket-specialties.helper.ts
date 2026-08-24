import type { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

/**
 * Retorna externalIds de catálogos permitidos para a empresa.
 * `null` = sem restrição (nenhuma linha configurada).
 */
export async function resolveAllowedDeskExternalIdsForCompany(
  prisma: PrismaService,
  companyId: string | null | undefined,
): Promise<Set<number> | null> {
  if (!companyId) return null;

  const links = await prisma.companyTicketSpecialty.findMany({
    where: { companyId },
    include: {
      specialty: {
        select: { externalId: true, active: true, deletedAt: true },
      },
    },
  });

  if (links.length === 0) return null;

  const allowed = new Set<number>();
  for (const link of links) {
    if (link.specialty.deletedAt != null || !link.specialty.active) continue;
    const ext = link.specialty.externalId;
    if (ext != null && Number.isFinite(Number(ext))) {
      allowed.add(Number(ext));
    }
  }
  return allowed;
}

export async function assertDeskAllowedForCompany(
  prisma: PrismaService,
  companyId: string | null | undefined,
  deskExternalId: number,
): Promise<void> {
  const allowed = await resolveAllowedDeskExternalIdsForCompany(
    prisma,
    companyId,
  );
  if (allowed == null) return;
  if (!allowed.has(Number(deskExternalId))) {
    throw new BadRequestException(
      'Este catálogo não está liberado para abertura de tickets pela sua empresa.',
    );
  }
}
