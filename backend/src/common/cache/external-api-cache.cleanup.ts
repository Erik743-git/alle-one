import type { PrismaService } from '../../prisma/prisma.service';

/** Remove entradas expiradas de external_api_cache (TiFlux/Zabbix). */
export async function cleanupExpiredExternalApiCache(
  prisma: PrismaService,
  limit = 500,
): Promise<number> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 5_000);
  try {
    const deleted = await prisma.$executeRawUnsafe(
      `
      DELETE FROM external_api_cache
      WHERE id IN (
        SELECT id FROM external_api_cache
        WHERE expires_at < NOW()
        ORDER BY expires_at ASC
        LIMIT $1
      )
    `,
      safeLimit,
    );
    return typeof deleted === 'number' ? deleted : 0;
  } catch {
    return 0;
  }
}
