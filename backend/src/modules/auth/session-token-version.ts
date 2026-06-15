import type { PrismaService } from '../../prisma/prisma.service';

export function resolveJwtTokenVersion(payloadTv?: number): number {
  return payloadTv ?? 0;
}

export async function incrementUserTokenVersion(
  prisma: PrismaService,
  userId: string,
): Promise<number> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  return updated.tokenVersion;
}
